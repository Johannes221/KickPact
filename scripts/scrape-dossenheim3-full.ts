/**
 * Vollständiger Saison-Scrape für FC Sportfreunde 1910 Dossenheim 3
 * Holt ALLE vergangenen Spiele der Saison 2526 und wertet Pledges aus.
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/scrape-dossenheim3-full.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { teams, matches as matchesTable } from "../lib/db/schema";
import { getSpiele, getSpielDetails } from "../lib/crawler/fussballde";
import {
  findMatchByFussballdeId,
  insertMatchWithEvents,
} from "../lib/db/queries/crawler";
import { evaluateTriggers, type MatchInput } from "../lib/crawler/triggers";
import { detectTeamSide } from "../lib/crawler/team-side";
import {
  loadActivePledgeRulesForTeam,
  getMonthlyChargedCents,
} from "../lib/db/queries/evaluation";
import { charges as chargesTable, pledges as pledgesTable } from "../lib/db/schema";

const TEAM_ID_FUSSBALLDE = "02EPKPAL98000000VS5489B1VT0RKM5V";
const TEAM_SLUG = "fc-sportfreunde-1910-dossenheim-3-fc-sportfr-dossenheim-baden";
const SAISON = "2526";

async function main() {
  console.log("=== Full Season Scrape: Dossenheim 3 ===\n");

  // DB-Team holen
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.fussballdeTeamId, TEAM_ID_FUSSBALLDE))
    .limit(1);

  if (!team) {
    console.error("Team nicht in DB! Bitte erst seed-real-dossenheim.ts ausführen.");
    process.exit(1);
  }
  console.log(`Team: ${team.name} (id=${team.id})\n`);

  // ── Phase 1: Alle vergangenen Spiele scrapen ────────────────────────────
  console.log("=== Phase 1: Spiele von fussball.de scrapen ===");
  let spiele;
  try {
    spiele = await getSpiele(TEAM_ID_FUSSBALLDE, TEAM_SLUG, SAISON);
  } catch (err) {
    console.error("getSpiele failed:", err);
    process.exit(1);
  }
  console.log(`Gefunden: ${spiele.length} vergangene Spiele`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const spiel of spiele) {
    const existing = await findMatchByFussballdeId(spiel.spielId);
    if (existing) {
      console.log(`  ↩ bereits vorhanden: ${spiel.datum} ${spiel.heim} vs ${spiel.gast}`);
      skipped++;
      continue;
    }

    try {
      const details = await getSpielDetails(spiel.spielId, spiel.slug);
      const { matchId, newEventCount } = await insertMatchWithEvents({
        teamId: team.id,
        listItem: spiel,
        details,
      });
      const ergebnis = `${details.ergebnis.heim}:${details.ergebnis.gast}`;
      const torschuetzen = details.events
        .filter((e) => e.typ === "TOR" && "spielerName" in e && e.spielerName)
        .map((e) => `${e.minute ?? "?"}' ${"spielerName" in e ? (e.spielerName ?? "") : ""}`)
        .join(", ");

      console.log(`  ✓ ${spiel.datum}  ${ergebnis}  ${details.heim} vs ${details.gast}`);
      if (torschuetzen) console.log(`     ⚽ Tore: ${torschuetzen}`);
      console.log(`     → ${newEventCount} Events gespeichert, matchId=${matchId}`);
      imported++;
    } catch (err) {
      console.error(`  ✗ ${spiel.datum} ${spiel.heim} vs ${spiel.gast}: ${err}`);
      failed++;
    }
  }

  console.log(`\n✓ ${imported} importiert, ${skipped} übersprungen, ${failed} Fehler\n`);

  // ── Phase 2: Evaluate-Match für alle neuen Matches ──────────────────────
  console.log("=== Phase 2: Pledges auswerten (evaluate-match) ===");

  // Alle Matches für dieses Team laden
  const allMatches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.teamId, team.id));

  console.log(`${allMatches.length} Matches total in DB`);

  const pledgeRules = await loadActivePledgeRulesForTeam(team.id, new Date());
  console.log(`${pledgeRules.length} aktive Pledge-Rules für dieses Team`);

  if (pledgeRules.length === 0) {
    console.log("⚠️  Keine aktiven Pledges — Charges werden nicht erzeugt.");
    console.log("   Bitte erst Sponsor einladen und Pledge anlegen.");
    console.log("\n=== FERTIG ===");
    return;
  }

  let totalCharges = 0;
  let totalCents = 0;

  for (const match of allMatches) {
    // Match-Events laden
    const { matchEvents } = await import("../lib/db/schema");
    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, match.id));

    // teamSide bestimmen (shared utility, handles "Herren - " prefix)
    const teamSide = detectTeamSide(team.name, match.heimName);

    // Als MatchInput formatieren
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

      // Monthly Cap prüfen
      const matchDate = new Date(match.datum);
      const [pledgeForRule] = await db
        .select({ monthlyCapCents: pledgesTable.monthlyCapCents })
        .from(pledgesTable)
        .where(eq(pledgesTable.id, result.pledgeId))
        .limit(1);

      let cappedAmount = result.amountCents;
      if (pledgeForRule?.monthlyCapCents) {
        const alreadyCharged = await getMonthlyChargedCents(result.pledgeId, matchDate);
        const remaining = pledgeForRule.monthlyCapCents - alreadyCharged;
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
        // Unique-Constraint → Charge existiert bereits, überspringen
        const msg = String(err);
        if (!msg.includes("unique") && !msg.includes("duplicate")) {
          console.error(`  Charge-Insert-Fehler für ${result.pledgeRuleId}: ${err}`);
        }
      }
    }
  }

  console.log(`\n✓ ${totalCharges} Charges erzeugt — Gesamt: ${(totalCents / 100).toFixed(2)} €`);

  // ── Abschluss-Report ────────────────────────────────────────────────────
  const matchCount = await db.select().from(matchesTable).where(eq(matchesTable.teamId, team.id));
  const chargeCount = await db.select().from(chargesTable);
  console.log(`\n=== DB-Status nach Scrape ===`);
  console.log(`Matches: ${matchCount.length}`);
  console.log(`Charges total: ${chargeCount.length}`);
  console.log("\n=== FERTIG ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
