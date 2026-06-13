/**
 * Einmaliger Sofort-Rollover auf Saison 26/27 (Feature-Wunsch 2026-06-12:
 * „26/27 soll es überall heißen", Umstellung SOFORT statt am 15.7.-Cron).
 *
 * Repliziert exakt die UPDATE-Logik aus lib/inngest/functions/season-rollover.ts,
 * aber mit EXPLIZITEM from/to (2526→2627) — der Cron würde am 12.6. wegen des
 * 1.7.-Stichtags fälschlich 2425→2526 rechnen.
 *
 * Dry-Run (Default):  npx dotenv -e .env.local -- npx tsx scripts/season-rollover-now.ts
 * Ausführen:          … scripts/season-rollover-now.ts --execute
 */
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { teams, seasons } from "../lib/db/schema";

const FROM = "2526";
const TO = "2627";

async function main() {
  const execute = process.argv.includes("--execute");

  const target = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.isActive, true), eq(teams.saison, FROM)));

  const [seasonRow] = await db.select().from(seasons).where(eq(seasons.code, TO));
  console.log(
    `seasons-Row ${TO}: ${seasonRow ? `vorhanden (matchdayFiveAt ${seasonRow.matchdayFiveAt?.toISOString().slice(0, 10)})` : "FEHLT — Saison-Ziele wären nicht buchbar!"}`
  );
  console.log(`\n${target.length} aktive Team(s) auf Saison ${FROM} → ${TO}:`);
  for (const t of target) console.log(`  ${t.name}`);

  if (!execute) {
    console.log(`\nDRY-RUN: nichts geändert. Mit --execute werden ${target.length} Teams gebumpt.`);
    return;
  }
  const bumped = await db
    .update(teams)
    .set({ saison: TO })
    .where(and(eq(teams.isActive, true), eq(teams.saison, FROM)))
    .returning({ id: teams.id });
  console.log(`\n✅ ${bumped.length} Teams auf ${TO} gebumpt.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
