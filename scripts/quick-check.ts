import { db } from "../lib/db/client";
import { matches, charges, pledges } from "../lib/db/schema";
import { eq, count } from "drizzle-orm";

const TEAMS = {
  "D1": "xyr9k593996uyiwc0dble2z7",
  "D2": "cz9vm71qw4gfiup09boqi3bf",
  "D3": "ytbng7w893495ncjtog7amce",
};

async function main() {
  for (const [name, teamId] of Object.entries(TEAMS)) {
    const matchRows = await db.select({ datum: matches.datum, heim: matches.heimName, gast: matches.gastName, ergebnisHeim: matches.ergebnisHeim, ergebnisGast: matches.ergebnisGast })
      .from(matches).where(eq(matches.teamId, teamId)).orderBy(matches.datum);
    const teamPledges = await db.select({ id: pledges.id }).from(pledges).where(eq(pledges.teamId, teamId));
    let chargeCount = 0; let chargeSum = 0;
    for (const p of teamPledges) {
      const ch = await db.select({ amt: charges.amountCents }).from(charges).where(eq(charges.pledgeId, p.id));
      chargeCount += ch.length; chargeSum += ch.reduce((s, c) => s + c.amt, 0);
    }
    console.log(`\n${name}: ${matchRows.length} matches, ${chargeCount} charges = ${(chargeSum/100).toFixed(2)}€`);
    for (const m of matchRows) {
      console.log(`  ${new Date(m.datum).toISOString().slice(0,10)}  ${m.heim} vs ${m.gast}  ${m.ergebnisHeim}:${m.ergebnisGast}`);
    }
  }
}
main().catch(console.error).finally(() => process.exit(0));
