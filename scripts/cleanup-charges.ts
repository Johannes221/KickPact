/**
 * Removes charges (and optionally matches) that fall outside the pledge period
 * for each team. Safe to re-run.
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/cleanup-charges.ts
 */
import { eq, lt, inArray } from "drizzle-orm";
import { db } from "../lib/db/client";
import { teams, matches as matchesTable, charges as chargesTable, pledges } from "../lib/db/schema";

async function main() {
  console.log("=== Cleanup: Charges außerhalb Pledge-Zeitraum entfernen ===\n");

  const allTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);

  for (const team of allTeams) {
    console.log(`\n--- ${team.name} ---`);

    // Load all pledges for this team
    const teamPledges = await db.select().from(pledges).where(eq(pledges.teamId, team.id));
    if (teamPledges.length === 0) {
      console.log("  Keine Pledges → skip");
      continue;
    }

    // Determine min pledge start and max pledge end
    const minStart = teamPledges.reduce((min, p) => {
      const d = p.startsAt ? new Date(p.startsAt) : null;
      return d && (!min || d < min) ? d : min;
    }, null as Date | null);

    const maxEnd = teamPledges.reduce((max, p) => {
      const d = p.endsAt ? new Date(p.endsAt) : null;
      return d && (!max || d > max) ? d : max;
    }, null as Date | null);

    console.log(`  Pledge-Zeitraum: ${minStart?.toISOString().slice(0,10)} → ${maxEnd?.toISOString().slice(0,10)}`);

    // Find all matches for this team
    const allMatches = await db.select({ id: matchesTable.id, datum: matchesTable.datum, heimName: matchesTable.heimName, gastName: matchesTable.gastName })
      .from(matchesTable)
      .where(eq(matchesTable.teamId, team.id));

    // Find matches outside pledge period
    const outsideMatches = allMatches.filter(m => {
      const d = new Date(m.datum);
      if (minStart && d < minStart) return true;
      if (maxEnd && d > maxEnd) return true;
      return false;
    });

    if (outsideMatches.length === 0) {
      console.log("  Alle Spiele innerhalb Pledge-Zeitraum ✓");
      continue;
    }

    console.log(`  ${outsideMatches.length} Spiele außerhalb Pledge-Zeitraum:`);
    for (const m of outsideMatches) {
      console.log(`    ${new Date(m.datum).toISOString().slice(0,10)} ${m.heimName} vs ${m.gastName}`);
    }

    const matchIds = outsideMatches.map(m => m.id);

    // Delete charges for those matches
    let deletedCharges = 0;
    for (const matchId of matchIds) {
      // Find charges that reference this match (via pledge)
      const matchCharges = await db.select({ id: chargesTable.id })
        .from(chargesTable)
        .where(eq(chargesTable.matchId, matchId));
      if (matchCharges.length > 0) {
        const chargeIds = matchCharges.map(c => c.id);
        await db.delete(chargesTable).where(inArray(chargesTable.id, chargeIds));
        deletedCharges += matchCharges.length;
      }
    }
    console.log(`  → ${deletedCharges} Charges gelöscht`);

    // Count remaining charges
    let remainingCharges = 0;
    let remainingCents = 0;
    for (const p of teamPledges) {
      const charges = await db.select({ amountCents: chargesTable.amountCents })
        .from(chargesTable)
        .where(eq(chargesTable.pledgeId, p.id));
      remainingCharges += charges.length;
      remainingCents += charges.reduce((s, c) => s + c.amountCents, 0);
    }
    console.log(`  Verbleibende Charges: ${remainingCharges} = ${(remainingCents/100).toFixed(2)} €`);
  }

  console.log("\n=== FERTIG ===");
}

main().catch(console.error).finally(() => process.exit(0));
