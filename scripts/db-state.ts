import { db } from "../lib/db/client";
import { matches, teams, pledges, charges } from "../lib/db/schema";
import { eq, count } from "drizzle-orm";

async function main() {
  const allTeams = await db.select().from(teams);

  for (const t of allTeams) {
    const [{ cnt: matchCnt }] = await db.select({ cnt: count() }).from(matches).where(eq(matches.teamId, t.id));
    const teamPledges = await db.select({ id: pledges.id }).from(pledges).where(eq(pledges.teamId, t.id));
    let chargeCnt = 0;
    let chargeSum = 0;
    for (const p of teamPledges) {
      const rows = await db.select({ amountCents: charges.amountCents }).from(charges).where(eq(charges.pledgeId, p.id));
      chargeCnt += rows.length;
      chargeSum += rows.reduce((s, r) => s + r.amountCents, 0);
    }
    const matchRows = await db.select({ datum: matches.datum, heim: matches.heimName, gast: matches.gastName, ergebnisHeim: matches.ergebnisHeim, ergebnisGast: matches.ergebnisGast }).from(matches).where(eq(matches.teamId, t.id)).orderBy(matches.datum);
    
    console.log(`\n=== ${t.name} (${t.id}) ===`);
    console.log(`  fussballdeTeamId: ${t.fussballdeTeamId}`);
    console.log(`  matches: ${matchCnt}  pledges: ${teamPledges.length}  charges: ${chargeCnt} = ${(chargeSum/100).toFixed(2)} €`);
    console.log("  Match list:");
    for (const m of matchRows) {
      console.log(`    ${new Date(m.datum).toISOString().slice(0,10)}  ${m.heim} vs ${m.gast}  ${m.ergebnisHeim}:${m.ergebnisGast}`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
