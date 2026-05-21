/**
 * Prüft DB-Status nach Scrape
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/check-db-state.ts
 */
import { db } from "../lib/db/client";
import { matches, matchEvents, charges, teams } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.fussballdeTeamId, "02EPKPAL98000000VS5489B1VT0RKM5V"))
    .limit(1);
  console.log("Team:", team?.name, "id=", team?.id);

  const allMatches = await db.select().from(matches).where(eq(matches.teamId, team.id));
  console.log("Matches:", allMatches.length);
  for (const m of allMatches) {
    const evts = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id));
    console.log(
      " ",
      new Date(m.datum).toISOString().split("T")[0],
      m.heimName,
      "vs",
      m.gastName,
      `${m.ergebnisHeim}:${m.ergebnisGast}`,
      `(${evts.length} events)`
    );
  }

  const allCharges = await db.select().from(charges);
  console.log("\nCharges total:", allCharges.length);
  let total = 0;
  for (const c of allCharges) {
    total += c.amountCents;
  }
  console.log("Charges Gesamt:", (total / 100).toFixed(2), "€");
}

main().catch(console.error);
