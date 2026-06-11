/**
 * Reparatur der Sommerpause-Charge-Lücke (Audit 2026-06-11, Phase 1 Task 5).
 *
 * Zwischen 1.6. und dem Fix unterdrückte der pauschale paused-Filter in
 * loadActivePledgeRulesForTeam alle Charges für Spiele, die im Juni gescraped
 * wurden. Da sich der Content-Hash der Matches danach nicht mehr ändert,
 * werden sie nie automatisch re-evaluiert. Dieses Script re-emittiert
 * `match/finished` für die betroffenen Spiele — die Charge-Erzeugung ist
 * idempotent (Unique-Indizes), bereits existierende Charges bleiben unberührt.
 *
 * Dry-Run (Default — zeigt nur, was passieren würde):
 *   npx dotenv -e .env.local -- npx tsx scripts/repair-sommerpause-charges.ts
 *
 * Ausführen (NACH Deploy des Fixes auf Staging, sonst läuft die Re-Evaluation
 * gegen den alten Code):
 *   npx dotenv -e .env.local -- npx tsx scripts/repair-sommerpause-charges.ts --execute
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { matches, teams, clubs, charges, pledges } from "../lib/db/schema";
import { inngest } from "../lib/inngest/client";

/** Spiele ab Mitte Mai erfassen (späte Mai-Spiele werden oft erst im Juni eingetragen). */
const MATCH_DATE_FROM = new Date("2026-05-15T00:00:00Z");
/** Nur Spiele, die der Crawler im Juni angefasst hat (Lücken-Fenster). */
const CRAWLED_FROM = new Date("2026-06-01T00:00:00Z");

async function main() {
  const execute = process.argv.includes("--execute");

  const rows = await db
    .select({
      matchId: matches.id,
      teamId: matches.teamId,
      datum: matches.datum,
      heim: matches.heimName,
      gast: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      crawledAt: matches.crawledAt,
      teamName: teams.name,
      clubName: clubs.name,
      chargeCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${charges}
        WHERE ${charges.matchId} = ${matches.id}
          AND ${charges.status} != 'cancelled'
      )`,
      // Pledges, deren Fenster das Spieldatum abdeckt — egal welcher Status
      // (der neue evaluation-Filter entscheidet selbst, was zählt).
      windowPledges: sql<number>`(
        SELECT COUNT(*)::int FROM ${pledges}
        WHERE ${pledges.teamId} = ${matches.teamId}
          AND ${pledges.startsAt} <= ${matches.datum}
          AND ${pledges.endsAt} >= ${matches.datum}
      )`
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(
      and(
        eq(matches.status, "finished"),
        gte(matches.datum, MATCH_DATE_FROM),
        gte(matches.crawledAt, CRAWLED_FROM)
      )
    )
    .orderBy(matches.datum);

  const candidates = rows.filter((r) => r.windowPledges > 0);
  const skippedNoPledges = rows.length - candidates.length;

  console.log(
    `Sommerpause-Reparatur — ${rows.length} im Juni gecrawlte Endstand-Spiele seit 15.05., ` +
      `davon ${candidates.length} mit Pledge-Fenster-Abdeckung (${skippedNoPledges} ohne Pledges übersprungen)\n`
  );

  for (const r of candidates) {
    console.log(
      `${r.datum.toISOString().slice(0, 10)}  ${r.clubName} / ${r.teamName}: ` +
        `${r.heim} ${r.ergebnisHeim}:${r.ergebnisGast} ${r.gast} — ` +
        `${r.chargeCount} Charge(s), ${r.windowPledges} Pledge(s) im Fenster`
    );
  }

  if (!execute) {
    console.log(
      `\nDRY-RUN: nichts gesendet. Mit --execute werden ${candidates.length} ` +
        `match/finished-Events re-emittiert (idempotent).`
    );
    return;
  }

  console.log(`\nSende ${candidates.length} match/finished-Events …`);
  // Inngest erlaubt Batch-Send; in 50er-Häppchen für saubere Fehlermeldungen.
  for (let i = 0; i < candidates.length; i += 50) {
    const batch = candidates.slice(i, i + 50);
    await inngest.send(
      batch.map((r) => ({
        name: "match/finished" as const,
        data: { matchId: r.matchId, teamId: r.teamId }
      }))
    );
    console.log(`  ${Math.min(i + 50, candidates.length)}/${candidates.length}`);
  }
  console.log(
    "Fertig. Charges entstehen asynchron via evaluate-match — danach mit " +
      "demselben Script (Dry-Run) die Charge-Counts gegenprüfen."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
