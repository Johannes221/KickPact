/**
 * Recalculates charges for ALL matches using the match date (not today) to check
 * pledge activity. Safe to re-run — unique constraint silently skips duplicates.
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/recalculate-charges.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { teams, matches as matchesTable, matchEvents, pledges, charges as chargesTable } from "../lib/db/schema";
import { evaluateTriggers, type MatchInput } from "../lib/crawler/triggers";
import { detectTeamSide } from "../lib/crawler/team-side";
import { loadActivePledgeRulesForTeam, getMonthlyChargedCents } from "../lib/db/queries/evaluation";

async function recalculateForTeam(team: { id: string; name: string }) {
  console.log(`\n=== ${team.name} ===`);

  const allMatches = await db.select().from(matchesTable).where(eq(matchesTable.teamId, team.id));
  console.log(`  ${allMatches.length} Spiele gesamt`);

  let newCharges = 0;
  let skippedMatches = 0;
  let totalCents = 0;

  for (const match of allMatches) {
    const matchDate = new Date(match.datum);

    // Load pledge rules active on the MATCH DATE
    const pledgeRules = await loadActivePledgeRulesForTeam(team.id, matchDate);
    if (pledgeRules.length === 0) {
      skippedMatches++;
      continue;
    }

    const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, match.id));
    const teamSide = detectTeamSide(team.name, match.heimName);

    const matchInput: MatchInput = {
      id: match.id,
      teamSide,
      ergebnisHeim: match.ergebnisHeim ?? 0,
      ergebnisGast: match.ergebnisGast ?? 0,
      halbzeitHeim: match.halbzeitHeim ?? null,
      halbzeitGast: match.halbzeitGast ?? null,
      events: events.map((e) => ({
        id: e.id,
        type: e.type as "tor" | "auswechslung" | "spezial" | "karte",
        subtype: e.subtype ?? undefined,
        minute: e.minute ?? null,
        side: e.side as "heim" | "gast",
        playerName: e.playerName ?? undefined,
        playerId: e.playerId ?? undefined,
        source: e.source as "scraped" | "manual",
      })),
    };

    const results = evaluateTriggers(matchInput, pledgeRules);

    for (const result of results) {
      if (result.amountCents <= 0) continue;

      let cappedAmount = result.amountCents;
      const [pledgeRow] = await db
        .select({ monthlyCapCents: pledges.monthlyCapCents })
        .from(pledges)
        .where(eq(pledges.id, result.pledgeId))
        .limit(1);

      if (pledgeRow?.monthlyCapCents) {
        const alreadyCharged = await getMonthlyChargedCents(result.pledgeId, matchDate);
        const remaining = pledgeRow.monthlyCapCents - alreadyCharged;
        if (remaining <= 0) continue;
        cappedAmount = Math.min(result.amountCents, remaining);
      }

      const [inserted] = await db.insert(chargesTable).values({
        pledgeId: result.pledgeId,
        pledgeRuleId: result.pledgeRuleId,
        matchId: match.id,
        matchEventId: result.matchEventId,
        triggerType: result.triggerType,
        amountCents: cappedAmount,
        status: "confirmed",
        // confirmedAt = Spieldatum (nicht new Date()): Monats-Cap-Fenster
        // (getMonthlyChargedCents) UND Rechnungs-Periode (generate-invoices)
        // selektieren beide über COALESCE(confirmedAt, createdAt). Beim Backfill
        // alle Charges auf "heute" zu stempeln kollabiert sonst jeden Spiel-Monat
        // in den aktuellen Monat → historische Monate ungecappt, aktueller Monat
        // übersprungen (E2E-Finding 2026-06-01).
        confirmedAt: matchDate,
      }).onConflictDoNothing().returning({ id: chargesTable.id });

      if (inserted) {
        newCharges++;
        totalCents += cappedAmount;
      }
    }
  }

  // Final totals
  const allTeamCharges = await db.select().from(chargesTable)
    .innerJoin(pledges, eq(chargesTable.pledgeId, pledges.id))
    .where(eq(pledges.teamId, team.id));
  const totalSum = allTeamCharges.reduce((s, r) => s + r.charges.amountCents, 0);

  console.log(`  → ${newCharges} neue Charges (+${(totalCents/100).toFixed(2)} €), ${skippedMatches} Spiele ohne aktive Pledge`);
  console.log(`  Gesamt: ${allTeamCharges.length} Charges = ${(totalSum/100).toFixed(2)} €`);
}

async function main() {
  console.log("=== Charges neu berechnen (alle Teams) ===");

  const allTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
  for (const team of allTeams) {
    await recalculateForTeam(team);
  }

  console.log("\n=== FERTIG ===");
}

main().catch(console.error).finally(() => process.exit(0));
