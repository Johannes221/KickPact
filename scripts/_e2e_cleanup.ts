/**
 * E2E-Test-Cleanup (2026-06-01 run).
 * Restores the shared demo "Dossenheim 3" team to its original club and removes
 * all data created by the end-to-end test run. Idempotent.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/_e2e_cleanup.ts
 */
import { db } from "../lib/db/client";
import { sql } from "drizzle-orm";

const TEAM_ID = "x6sei99gf3p4sgh77tvjhlwm";
const NEW_CLUB_ID = "j0ecsmqqxsmd0x6ujozrtejc";
const ORIG_CLUB_ID = "b1ockmqe5pvtdc5mhz6tfs97";
const PLEDGE_ID = "m9zg7fdpeoymin5cbvflrvao";

async function main() {
  // 1) invoices for the new club
  await db.execute(sql`DELETE FROM invoices WHERE club_id = ${NEW_CLUB_ID}`);
  // 2) charges of our pledge (also covered by pledge cascade, explicit for safety)
  await db.execute(sql`DELETE FROM charges WHERE pledge_id = ${PLEDGE_ID}`);
  // 3) pledge_rules + pledge
  await db.execute(sql`DELETE FROM pledge_rules WHERE pledge_id = ${PLEDGE_ID}`);
  await db.execute(sql`DELETE FROM pledges WHERE id = ${PLEDGE_ID}`);
  // 4) sponsors of the e2e sponsor user
  await db.execute(sql`DELETE FROM sponsors WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@e2e-test.kickpact.de')`);
  // 5) synthetic matches (cascades match_events + their charges)
  await db.execute(sql`DELETE FROM matches WHERE fussballde_spiel_id LIKE 'E2E-%'`);
  // 6) sponsor invitations for the team
  await db.execute(sql`DELETE FROM sponsor_invitations WHERE team_id = ${TEAM_ID}`);
  // 7) team verifications for the team
  await db.execute(sql`DELETE FROM team_verifications WHERE team_id = ${TEAM_ID}`);
  // 8) team memberships of e2e users on the team
  await db.execute(sql`DELETE FROM team_memberships WHERE team_id = ${TEAM_ID} AND user_id IN (SELECT id FROM users WHERE email LIKE '%@e2e-test.kickpact.de')`);
  // 9) team license tied to the new club
  await db.execute(sql`DELETE FROM team_licenses WHERE team_id = ${TEAM_ID}`);
  // 10) RESTORE the shared demo team into its original club, clear run artifacts
  await db.execute(sql`UPDATE teams SET club_id = ${ORIG_CLUB_ID}, verified_at = NULL, logo_url = NULL WHERE id = ${TEAM_ID}`);
  // 11) subscription + club memberships + the new club
  await db.execute(sql`DELETE FROM subscriptions WHERE club_id = ${NEW_CLUB_ID}`);
  await db.execute(sql`DELETE FROM club_memberships WHERE club_id = ${NEW_CLUB_ID}`);
  await db.execute(sql`DELETE FROM clubs WHERE id = ${NEW_CLUB_ID}`);
  // 12) e2e users (sessions/accounts cascade)
  await db.execute(sql`DELETE FROM users WHERE email LIKE '%@e2e-test.kickpact.de'`);
  // 13) seeded season (only if you want it gone; it did not pre-exist)
  await db.execute(sql`DELETE FROM seasons WHERE code = '2526'`);

  // Verify
  const orphanClub = await db.execute(sql`SELECT count(*) n FROM clubs WHERE id = ${NEW_CLUB_ID}`);
  const team = await db.execute(sql`SELECT club_id, verified_at, logo_url FROM teams WHERE id = ${TEAM_ID}`);
  const users = await db.execute(sql`SELECT count(*) n FROM users WHERE email LIKE '%@e2e-test.kickpact.de'`);
  const synth = await db.execute(sql`SELECT count(*) n FROM matches WHERE fussballde_spiel_id LIKE 'E2E-%'`);
  console.log("new club remaining:", (orphanClub as any).rows?.[0]);
  console.log("team restored to:", (team as any).rows?.[0]);
  console.log("e2e users remaining:", (users as any).rows?.[0]);
  console.log("synthetic matches remaining:", (synth as any).rows?.[0]);
  console.log("CLEANUP DONE");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
