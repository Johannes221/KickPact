import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { clubs } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";

/**
 * Smoke-test: verifies the test database is reachable, migrations apply, and
 * basic insert/select works. If this fails, no other integration test can run.
 *
 * Bring DB up with:
 *   docker compose -f docker-compose.test.yml up -d
 */
describe.skipIf(isIntegrationDbDisabled)("test-db smoke", () => {
  beforeAll(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("applies migrations and round-trips a club row", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values({
      id: "c_smoke",
      slug: "smoke-club",
      name: "Smoke Club",
      ort: "Testort",
      isSmallBusiness: false
    });
    const rows = await db.select().from(clubs).where(eq(clubs.id, "c_smoke"));
    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe("Smoke Club");
  });

  it("resetTestDb wipes business data", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values({
      id: "c_smoke_2",
      slug: "smoke-club-2",
      name: "Smoke Club 2",
      isSmallBusiness: false
    });
    const before = await db.select().from(clubs);
    expect(before.length).toBeGreaterThan(0);

    await resetTestDb();

    const after = await db.select().from(clubs);
    expect(after.length).toBe(0);
  });
});
