/**
 * Integration-test database harness.
 *
 * Spins up a per-test-process drizzle client against an isolated Postgres
 * (docker-compose.test.yml on port 54329 by default). Migrations are applied
 * on first call to `getTestDb()`. Subsequent calls reuse the same connection
 * pool. `resetTestDb()` truncates all business tables between tests to keep
 * cases independent.
 *
 * To run integration tests:
 *   docker compose -f docker-compose.test.yml up -d
 *   npm test -- tests/scraper/integration
 *
 * Override DB URL via `DATABASE_URL_TEST` env (e.g. CI).
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://test:test@localhost:54329/kickpact_test";

let connection: ReturnType<typeof postgres> | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let migrationsApplied = false;

export async function getTestDb(): Promise<PostgresJsDatabase<typeof schema>> {
  if (!dbInstance) {
    connection = postgres(TEST_URL, { max: 5, onnotice: () => {} });
    dbInstance = drizzle(connection, { schema });
  }
  if (!migrationsApplied) {
    await migrate(dbInstance, { migrationsFolder: "./drizzle/migrations" });
    migrationsApplied = true;
  }
  return dbInstance;
}

/**
 * Truncates ALL business tables in dependency-safe order via `RESTART IDENTITY CASCADE`.
 * Auth tables (sessions/accounts/verifications) are included because integration
 * tests may seed users.
 */
export async function resetTestDb(): Promise<void> {
  const db = await getTestDb();
  // CASCADE handles FK ordering; we list every business table explicitly so the
  // operation fails loud if a new table is added without being considered here.
  await db.execute(/* sql */ `
    TRUNCATE
      device_tokens,
      notifications,
      notification_settings,
      invoice_items,
      invoice_counters,
      invoices,
      charges,
      event_approvals,
      match_events,
      matches,
      players,
      pledge_rules,
      pledges,
      sponsor_inquiries,
      sponsor_invitations,
      sponsors,
      season_results,
      seasons,
      team_licenses,
      subscriptions,
      consumed_trials,
      processed_stripe_events,
      sent_notifications,
      club_verifications,
      club_membership_requests,
      team_memberships,
      team_images,
      club_memberships,
      operator_audit_log,
      support_ticket_replies,
      support_tickets,
      teams,
      clubs,
      sessions,
      accounts,
      verifications,
      users
    RESTART IDENTITY CASCADE;
  `);
}

export async function closeTestDb(): Promise<void> {
  if (connection) {
    await connection.end({ timeout: 5 });
    connection = null;
    dbInstance = null;
    migrationsApplied = false;
  }
}

/**
 * Skip helper — use in `describe.skipIf(...)` to gate integration suites that
 * require a running Postgres.
 *
 * Skipped when EITHER:
 *   - `SKIP_DB_INTEGRATION=1` is set explicitly, OR
 *   - `DATABASE_URL_TEST` is unset (local dev without docker-compose up).
 *
 * In CI we always set `DATABASE_URL_TEST` (postgres service container), so
 * the suites run. Locally a developer needs to either spin up docker-compose
 * or just run `npm test` and accept that the integration layer is skipped.
 */
export const isIntegrationDbDisabled =
  process.env.SKIP_DB_INTEGRATION === "1" || !process.env.DATABASE_URL_TEST;
