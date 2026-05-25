/**
 * Integration tests for the paginate() helper.
 *
 * Uses the real test Postgres (docker-compose.test.yml). Gated on
 * `isIntegrationDbDisabled` so contributors without the test DB up don't see
 * spurious failures. Pattern follows `tests/scraper/integration/_db-smoke.test.ts`.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { clubs } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  countStar,
  paginate,
  parsePaginationFromSearchParams,
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE
} from "@/lib/db/queries/_helpers/paginate";

describe.skipIf(isIntegrationDbDisabled)("paginate() (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  async function seedClubs(n: number) {
    const db = await getTestDb();
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `c_p_${String(i).padStart(3, "0")}`,
      slug: `club-${i}`,
      name: `Club ${String(i).padStart(3, "0")}`,
      ort: "Testort",
      isSmallBusiness: false
    }));
    if (rows.length > 0) await db.insert(clubs).values(rows);
  }

  it("returns first page with correct total + totalPages", async () => {
    await seedClubs(53);
    const db = await getTestDb();

    const dataQuery = db
      .select({ id: clubs.id, name: clubs.name })
      .from(clubs)
      .orderBy(clubs.name)
      .$dynamic();
    const countQuery = db
      .select({ count: countStar() })
      .from(clubs)
      .$dynamic();

    const res = await paginate<{ id: string; name: string }>(
      dataQuery,
      countQuery,
      { page: 1, pageSize: 10 }
    );

    expect(res.total).toBe(53);
    expect(res.totalPages).toBe(6);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(10);
    expect(res.rows).toHaveLength(10);
    expect(res.rows[0]?.name).toBe("Club 000");
  });

  it("returns correct slice for middle page", async () => {
    await seedClubs(53);
    const db = await getTestDb();

    const res = await paginate<{ id: string; name: string }>(
      db.select({ id: clubs.id, name: clubs.name }).from(clubs).orderBy(clubs.name).$dynamic(),
      db.select({ count: countStar() }).from(clubs).$dynamic(),
      { page: 3, pageSize: 10 }
    );

    expect(res.rows).toHaveLength(10);
    expect(res.rows[0]?.name).toBe("Club 020");
    expect(res.rows.at(-1)?.name).toBe("Club 029");
  });

  it("last page returns the remainder", async () => {
    await seedClubs(53);
    const db = await getTestDb();

    const res = await paginate<{ id: string; name: string }>(
      db.select({ id: clubs.id, name: clubs.name }).from(clubs).orderBy(clubs.name).$dynamic(),
      db.select({ count: countStar() }).from(clubs).$dynamic(),
      { page: 6, pageSize: 10 }
    );

    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]?.name).toBe("Club 050");
  });

  it("respects filters in both queries (where clause)", async () => {
    await seedClubs(30);
    const db = await getTestDb();
    // Pick a single club via slug filter.
    const targetSlug = "club-7";

    const res = await paginate<{ id: string }>(
      db.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, targetSlug)).$dynamic(),
      db.select({ count: countStar() }).from(clubs).where(eq(clubs.slug, targetSlug)).$dynamic(),
      { page: 1, pageSize: 10 }
    );

    expect(res.total).toBe(1);
    expect(res.totalPages).toBe(1);
    expect(res.rows).toHaveLength(1);
  });

  it("returns empty rows + totalPages=1 when no matches", async () => {
    const db = await getTestDb();

    const res = await paginate<{ id: string }>(
      db.select({ id: clubs.id }).from(clubs).$dynamic(),
      db.select({ count: countStar() }).from(clubs).$dynamic(),
      { page: 1, pageSize: 25 }
    );

    expect(res.total).toBe(0);
    expect(res.totalPages).toBe(1);
    expect(res.rows).toEqual([]);
  });

  it("clamps page beyond totalPages to last page (rows may be empty)", async () => {
    await seedClubs(15);
    const db = await getTestDb();

    const res = await paginate<{ id: string }>(
      db.select({ id: clubs.id }).from(clubs).orderBy(clubs.id).$dynamic(),
      db.select({ count: countStar() }).from(clubs).$dynamic(),
      { page: 99, pageSize: 10 }
    );

    // totalPages = 2, page should be clamped to 2 (we don't refetch though).
    expect(res.totalPages).toBe(2);
    expect(res.page).toBe(2);
  });

  it("orderBy in dataQuery is preserved (desc works)", async () => {
    await seedClubs(5);
    const db = await getTestDb();

    const res = await paginate<{ id: string; name: string }>(
      db.select({ id: clubs.id, name: clubs.name }).from(clubs).orderBy(desc(clubs.name)).$dynamic(),
      db.select({ count: countStar() }).from(clubs).$dynamic(),
      { page: 1, pageSize: 10 }
    );

    expect(res.rows[0]?.name).toBe("Club 004");
    expect(res.rows.at(-1)?.name).toBe("Club 000");
  });
});

// ---------- parsePaginationFromSearchParams: pure helper ----------

describe("parsePaginationFromSearchParams (pure)", () => {
  function sp(record: Record<string, string>) {
    return {
      get(key: string): string | null {
        return record[key] ?? null;
      }
    };
  }

  it("returns defaults when keys missing", () => {
    expect(parsePaginationFromSearchParams(sp({}))).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE
    });
  });

  it("parses valid page + pageSize", () => {
    expect(parsePaginationFromSearchParams(sp({ page: "3", pageSize: "50" }))).toEqual({
      page: 3,
      pageSize: 50
    });
  });

  it("falls back to default pageSize on disallowed value", () => {
    expect(parsePaginationFromSearchParams(sp({ pageSize: "42" }))).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE
    });
  });

  it("falls back to page=1 on garbage input", () => {
    expect(parsePaginationFromSearchParams(sp({ page: "abc" }))).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE
    });
  });

  it("ALLOWED_PAGE_SIZES are 10/25/50/100", () => {
    expect([...ALLOWED_PAGE_SIZES]).toEqual([10, 25, 50, 100]);
  });
});
