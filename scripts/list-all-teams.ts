/**
 * Lists all teams and their match/charge counts.
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/list-all-teams.ts
 */
import { db } from "../lib/db/client";
import { teams, matches, charges, pledges } from "../lib/db/schema";
import { eq, count } from "drizzle-orm";

async function main() {
  const allTeams = await db.select({ id: teams.id, name: teams.name, fussballdeTeamId: teams.fussballdeTeamId }).from(teams);
  console.log(`\n=== ${allTeams.length} Teams in DB ===\n`);

  for (const team of allTeams) {
    const [matchRow] = await db.select({ cnt: count() }).from(matches).where(eq(matches.teamId, team.id));
    const teamPledges = await db.select({ id: pledges.id }).from(pledges).where(eq(pledges.teamId, team.id));
    let chargeCount = 0;
    for (const p of teamPledges) {
      const [cr] = await db.select({ cnt: count() }).from(charges).where(eq(charges.pledgeId, p.id));
      chargeCount += cr.cnt;
    }
    console.log(`${team.name}`);
    console.log(`  id=${team.id}`);
    console.log(`  fussballdeId=${team.fussballdeTeamId ?? "N/A"}`);
    console.log(`  matches=${matchRow.cnt}  pledges=${teamPledges.length}  charges=${chargeCount}`);
    console.log();
  }
}

main().catch(console.error).finally(() => process.exit(0));
