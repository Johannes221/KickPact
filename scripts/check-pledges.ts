/**
 * Prüft Sponsor/Pledge-Status in der DB
 */
import { db } from "../lib/db/client";
import { teams, sponsors, pledges, pledgeRules } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const allTeams = await db.select({ id: teams.id, name: teams.name, clubId: teams.clubId }).from(teams);
  console.log(`\nTeams (${allTeams.length}):`);
  for (const t of allTeams) console.log(`  ${t.name} (id=${t.id})`);

  const allSponsors = await db.select().from(sponsors);
  console.log(`\nSponsors (${allSponsors.length}):`);
  for (const s of allSponsors) console.log(`  ${s.displayName} (id=${s.id})`);

  const allPledges = await db.select().from(pledges);
  console.log(`\nPledges (${allPledges.length}):`);
  for (const p of allPledges) {
    const rules = await db.select().from(pledgeRules).where(eq(pledgeRules.pledgeId, p.id));
    const team = allTeams.find(t => t.id === p.teamId);
    console.log(`  ${team?.name ?? p.teamId} - status=${p.status} - ${rules.length} rules`);
    for (const r of rules) console.log(`    rule: ${r.triggerType} ${r.amountCents/100}€`);
  }
}

main().catch(console.error);
