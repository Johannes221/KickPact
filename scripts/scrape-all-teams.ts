/**
 * Scrapes ALL past matches for every team in the DB and (re-)evaluates charges.
 * Handles multiple saisons and uses per-match pledge date evaluation.
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/scrape-all-teams.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { teams, matches as matchesTable, matchEvents, pledges, charges as chargesTable } from "../lib/db/schema";
import { getSpiele, getSpielDetails } from "../lib/crawler/fussballde";
import { findMatchByFussballdeId, insertMatchWithEvents } from "../lib/db/queries/crawler";
import { evaluateTriggers, type MatchInput } from "../lib/crawler/triggers";
import { detectTeamSide } from "../lib/crawler/team-side";
import { loadActivePledgeRulesForTeam, getMonthlyChargedCents } from "../lib/db/queries/evaluation";

// Scrape both current and previous season to cover all pledge periods
const SAISONS = ["2526", "2425"];

async function scrapeAndChargeTeam(team: {
  id: string;
  name: string;
  fussballdeTeamId: string | null;
  fussballdeSlug: string | null;
}) {
  if (!team.fussballdeTeamId || !team.fussballdeSlug) {
    console.log(`  ⚠ Kein fussball.de-Link → übersprungen`);
    return;
  }

  console.log(`\n=== ${team.name} ===`);

  // ── Phase 1: Spiele scrapen (beide Saisons) ──────────────────────────────
  console.log("  Phase 1: Spiele scrapen…");
  const allSpiele = new Map<string, Awaited<ReturnType<typeof getSpiele>>[0]>();

  for (const saison of SAISONS) {
    let spiele;
    try {
      spiele = await getSpiele(team.fussballdeTeamId, team.fussballdeSlug, saison);
      console.log(`    Saison ${saison}: ${spiele.length} vergangene Spiele`);
    } catch (err) {
      console.error(`    ✗ getSpiele(${saison}) failed: ${err}`);
      continue;
    }
    for (const s of spiele) {
      if (!allSpiele.has(s.spielId)) allSpiele.set(s.spielId, s);
    }
  }

  console.log(`  Gesamt dedupliziert: ${allSpiele.size} Spiele`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const spiel of allSpiele.values()) {
    const existing = await findMatchByFussballdeId(spiel.spielId);
    if (existing) {
      skipped++;
      continue;
    }
    try {
      const details = await getSpielDetails(spiel.spielId, spiel.slug);
      await insertMatchWithEvents({ teamId: team.id, listItem: spiel, details });
      const ergebnis = `${details.ergebnis.heim}:${details.ergebnis.gast}`;
      console.log(`    ✓ ${spiel.datum}  ${ergebnis}  ${details.heim} vs ${details.gast}`);
      imported++;
    } catch (err) {
      // Ignore duplicate key violations (match already inserted by concurrent/previous run)
      const errObj = err as { code?: string };
      if (errObj?.code === "23505") { skipped++; continue; }
      console.error(`    ✗ ${spiel.datum} ${spiel.heim} vs ${spiel.gast}: ${err}`);
      failed++;
    }
  }
  console.log(`  → ${imported} importiert, ${skipped} bereits vorhanden, ${failed} Fehler`);

  // ── Phase 2: Charges berechnen (per-match pledge dates) ──────────────────
  console.log("  Phase 2: Charges auswerten…");
  const allMatches = await db.select().from(matchesTable).where(eq(matchesTable.teamId, team.id));

  let totalCharges = 0;
  let totalCents = 0;
  let skippedMatches = 0;

  for (const match of allMatches) {
    const matchDate = new Date(match.datum);

    // Load pledge rules active on the MATCH DATE — not today
    const pledgeRules = await loadActivePledgeRulesForTeam(team.id, matchDate);
    if (pledgeRules.length === 0) {
      skippedMatches++;
      continue; // no pledge active on this match date
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
        confirmedAt: new Date(),
      }).onConflictDoNothing().returning({ id: chargesTable.id });

      if (inserted) {
        totalCharges++;
        totalCents += cappedAmount;
      }
    }
  }

  const allTeamCharges = await db.select().from(chargesTable)
    .innerJoin(pledges, eq(chargesTable.pledgeId, pledges.id))
    .where(eq(pledges.teamId, team.id));

  const totalSum = allTeamCharges.reduce((s, r) => s + r.charges.amountCents, 0);
  console.log(`  ✓ ${totalCharges} neue Charges erzeugt (+${(totalCents/100).toFixed(2)} €), ${skippedMatches} Spiele ohne aktive Pledge übersprungen`);
  console.log(`  ✓ Gesamt-Charges für Team: ${allTeamCharges.length} = ${(totalSum/100).toFixed(2)} €`);
}

async function main() {
  console.log("=== Scrape & Charge: Alle Teams ===");

  const allTeams = await db
    .select({ id: teams.id, name: teams.name, fussballdeTeamId: teams.fussballdeTeamId, fussballdeSlug: teams.fussballdeSlug })
    .from(teams);

  console.log(`${allTeams.length} Teams gefunden\n`);

  for (const team of allTeams) {
    await scrapeAndChargeTeam(team);
  }

  console.log("\n=== FERTIG ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
