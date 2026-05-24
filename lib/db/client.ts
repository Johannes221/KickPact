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

const queryClient = postgres(resolveDbUrl(), { prepare: false });
export const db = drizzle(queryClient, { schema: { ...schema, ...relations } });
export type DB = typeof db;
