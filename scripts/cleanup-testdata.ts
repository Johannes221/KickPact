/**
 * Löscht alle Fake-Testdaten aus der DB.
 * FC Sportfr. Dossenheim (id=b1ockmqe5pvtdc5mhz6tfs97) wird NICHT angefasst.
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx --tsconfig tsconfig.json scripts/cleanup-testdata.ts
 */
import { inArray, like, or, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { clubs } from "../lib/db/schema/clubs";
import { users } from "../lib/db/schema/auth";

const PROTECTED_CLUB_ID = "b1ockmqe5pvtdc5mhz6tfs97";

async function main() {
  console.log("=== KickPact Testdata Cleanup ===\n");

  // 1. Find test clubs (by slug or name) — but not the real Dossenheim club
  const testClubs = await db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(
      or(
        like(clubs.slug, "test-fc-e2e%"),
        like(clubs.slug, "tsv-dossenheim%"),
        eq(clubs.name, "Test FC E2E"),
        eq(clubs.name, "TSV Dossenheim")
      )
    );

  const clubsToDelete = testClubs.filter((c) => c.id !== PROTECTED_CLUB_ID);

  if (clubsToDelete.length > 0) {
    console.log(`Found ${clubsToDelete.length} test club(s) to delete:`);
    for (const c of clubsToDelete) {
      console.log(`  - [${c.id}] ${c.name} (slug: ${c.slug})`);
    }
    const idsToDelete = clubsToDelete.map((c) => c.id);
    await db.delete(clubs).where(inArray(clubs.id, idsToDelete));
    console.log(`✓ Deleted ${clubsToDelete.length} club(s) and all cascaded data\n`);
  } else {
    console.log("No test clubs found to delete.\n");
  }

  // 2. Find and delete test user accounts (@kickpact-seed.test emails)
  const testUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(like(users.email, "%@kickpact-seed.test"));

  if (testUsers.length > 0) {
    console.log(`Found ${testUsers.length} test user(s) to delete:`);
    for (const u of testUsers) {
      console.log(`  - [${u.id}] ${u.email}`);
    }
    const userIds = testUsers.map((u) => u.id);
    await db.delete(users).where(inArray(users.id, userIds));
    console.log(`✓ Deleted ${testUsers.length} test user(s) and all cascaded data\n`);
  } else {
    console.log("No test users (@kickpact-seed.test) found to delete.\n");
  }

  // 3. Summary
  console.log("=== Cleanup complete ===");
  console.log(`Protected club (FC Sportfr. Dossenheim, id=${PROTECTED_CLUB_ID}) was NOT touched.`);
}

main().catch(console.error);
