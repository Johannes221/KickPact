import { db } from "../lib/db/client";
import { pledges, pledgeRules } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const TEAMS = {
  "Dossenheim 1": "xyr9k593996uyiwc0dble2z7",
  "Dossenheim 2": "cz9vm71qw4gfiup09boqi3bf",
  "Dossenheim 3": "ytbng7w893495ncjtog7amce",
};

async function main() {
  for (const [name, teamId] of Object.entries(TEAMS)) {
    console.log(`\n=== ${name} ===`);
    const teamPledges = await db.select().from(pledges).where(eq(pledges.teamId, teamId));
    for (const p of teamPledges) {
      console.log(`  Pledge ${p.id}: sponsor=${p.sponsorId} status=${p.status} startsAt=${p.startsAt?.toISOString()?.slice(0,10)} endsAt=${p.endsAt?.toISOString()?.slice(0,10)} monthlyCap=${p.monthlyCapCents ? (p.monthlyCapCents/100)+"€" : "none"}`);
      const rules = await db.select().from(pledgeRules).where(eq(pledgeRules.pledgeId, p.id));
      for (const r of rules) {
        console.log(`    Rule ${r.id}: trigger=${r.triggerType} subtype=${r.subtype} side=${r.side} amountCents=${r.amountCents} active=${r.isActive}`);
      }
    }
  }
}
main().catch(console.error).finally(() => process.exit(0));
