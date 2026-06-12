import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as relations from "./relations";

/**
 * DB URL resolution:
 *
 * 1. When running under Vitest (NODE_ENV=test or VITEST=1), prefer
 *    `DATABASE_URL_TEST` so unit / query tests hit the isolated local Postgres
 *    (docker-compose.test.yml) instead of the shared Neon DEV database.
 *    This eliminates cross-process / cross-worktree race conditions on shared
 *    tables during `npm test`.
 * 2. Otherwise fall back to `DATABASE_URL` (prod / dev runtime).
 *
 * If `DATABASE_URL_TEST` is unset in a test environment we still fall back to
 * `DATABASE_URL` so CI environments without a separate test DB keep working.
 */
function resolveDbUrl(): string {
  const isTest =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (isTest && process.env.DATABASE_URL_TEST) {
    return process.env.DATABASE_URL_TEST;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  return process.env.DATABASE_URL;
}

/**
 * Test-Runtime: Vitest isoliert Module pro Test-FILE — auch im singleFork
 * bekommt jede Datei eine frische Instanz dieses Moduls und damit einen
 * eigenen Pool, der nie explizit geschlossen wird. Mit postgres-js-Defaults
 * (max=10, idle_timeout=0 ⇒ nie schließen) akkumulieren ~160 Test-Dateien
 * Verbindungen bis "sorry, too many clients already". Daher im Test: kleiner
 * Pool + aggressives idle_timeout, damit Verbindungen zwischen den Dateien
 * zurückgegeben werden.
 */
const isTestRuntime =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true";
const queryClient = postgres(
  resolveDbUrl(),
  isTestRuntime
    ? { prepare: false, max: 2, idle_timeout: 5, max_lifetime: 60 }
    : { prepare: false }
);
export const db = drizzle(queryClient, { schema: { ...schema, ...relations } });
export type DB = typeof db;
