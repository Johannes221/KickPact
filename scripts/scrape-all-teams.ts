/**
 * Scrapes ALL past matches for every team in the DB and (re-)evaluates charges.
 * Handles pagination so Hinrunde + Rückrunde are both captured.
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

const SAISON = "2526";

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

  // ── Phase 1: Spiele scrapen ──────────────────────────────────────────────
  console.log("  Phase 1: Spiele scrapen…");
  let spiele;
  try {
    spiele = await getSpiele(team.fussballdeTeamId, team.fussballdeSlug, SAISON);
  } catch (err) {
    console.error(`  ✗ getSpiele failed: ${err}`);
    return;
  }
  console.log(`  Gefunden: ${spiele.length} vergangene Spiele`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const spiel of spiele) {
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
      console.error(`    ✗ ${spiel.datum} ${spiel.heim} vs ${spiel.gast}: ${err}`);
      failed++;
    }
  }
  console.log(`  → ${imported} importiert, ${skipped} bereits vorhanden, ${failed} Fehler`);

  // ── Phase 2: Charges berechnen ───────────────────────────────────────────
  console.log("  Phase 2: Charges auswerten…");
  const allMatches = await db.select().from(matchesTable).where(eq(matchesTable.teamId, team.id));
  const pledgeRules = await loadActivePledgeRulesForTeam(team.id, new Date());

  if (pledgeRules.length === 0) {
    console.log("  ⚠ Keine aktiven Pledges → keine Charges");
    return;
  }

  let totalCharges = 0;
  let totalCents = 0;

  for (const match of allMatches) {
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
    const matchDate = new Date(match.datum);

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

      try {
        await db.insert(chargesTable).values({
          pledgeId: result.pledgeId,
          pledgeRuleId: result.pledgeRuleId,
          matchId: match.id,
          matchEventId: result.matchEventId,
          triggerType: result.triggerType,
          amountCents: cappedAmount,
          status: "confirmed",
          confirmedAt: new Date(),
        });
        totalCharges++;
        totalCents += cappedAmount;
      } catch (err) {
        const msg = String(err);
        if (!msg.includes("unique") && !msg.includes("duplicate")) {
          console.error(`    Charge-Fehler ${result.pledgeRuleId}: ${err}`);
        }
      }
    }
  }

  const allTeamCharges = await db.select().from(chargesTable)
    .innerJoin(pledges, eq(chargesTable.pledgeId, pledges.id))
    .where(eq(pledges.teamId, team.id));

  const totalSum = allTeamCharges.reduce((s, r) => s + r.charges.amountCents, 0);
  console.log(`  ✓ ${totalCharges} neue Charges erzeugt (+${(totalCents/100).toFixed(2)} €)`);
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
