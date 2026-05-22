import { db } from "../lib/db/client";
import { matches } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const spielIds = [
    "02Q438G7UK000000VS5489B4VTH92TNV",
    "02TNNQ87QK000000VS5489BUVSSD35NB",
  ];

  for (const id of spielIds) {
    const rows = await db.select().from(matches).where(eq(matches.fussballdeSpielId, id));
    console.log(id + ":", rows.length > 0 ? "FOUND teamId=" + rows[0].teamId + " " + rows[0].heimName + " vs " + rows[0].gastName + " " + new Date(rows[0].datum).toISOString().slice(0,10) : "NOT IN DB");
  }

  const d1matches = await db.select({
    datum: matches.datum,
    heim: matches.heimName,
    gast: matches.gastName,
    ergebnisHeim: matches.ergebnisHeim,
    ergebnisGast: matches.ergebnisGast,
    teamId: matches.teamId,
    spielId: matches.fussballdeSpielId,
  }).from(matches).where(eq(matches.teamId, "xyr9k593996uyiwc0dble2z7")).orderBy(matches.datum);

  console.log("\nDossenheim 1 matches (" + d1matches.length + "):");
  for (const m of d1matches) {
    const d = new Date(m.datum);
    console.log("  " + d.toISOString().slice(0,10) + "  " + m.heim + " vs " + m.gast + "  " + m.ergebnisHeim + ":" + m.ergebnisGast);
  }
}

main().catch(console.error).finally(() => process.exit(0));
