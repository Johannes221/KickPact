/**
 * Integration test for the crawl-matches inngest pipeline.
 *
 * Mocks lib/crawler/fussballde (`getSpiele`, `getSpielDetails`) to return
 * fixture JSON, then drives the extracted core (`runCrawlForTeam`) end-to-end
 * against the test DB. Verifies:
 *
 *   1. All scraped matches + events land in `matches` and `match_events`.
 *   2. A second invocation is idempotent — no duplicate rows.
 *
 * STATUS: skipped pending Phase 4 merge.
 *   - `runCrawlForTeam(teamId, saison)` is not yet exported from
 *     `lib/inngest/functions/crawl-matches.ts` (currently only the Inngest
 *     wrapper exists, which can't be invoked directly).
 *   - `computeMatchHash` (Phase 4 addition for the match-update path) is
 *     referenced by the test setup.
 * Once Phase 4 lands, remove the `.skip` and uncomment the imports.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { matchEvents, matches } from "@/lib/db/schema";
import { closeTestDb, getTestDb, isIntegrationDbDisabled, resetTestDb } from "../../setup/integration-db";
import { seedClubFromFixture } from "../../fixtures/scraper/seed-from-fixtures";
import { JSON_ROOT } from "../../fixtures/scraper/config";

// Mock the scraper module. Each implementation reads from the fixture JSON
// captured under tests/fixtures/scraper/json/<club>/. When the corresponding
// fixture is missing the mock throws — test gets skipped via the suite guard.
vi.mock("@/lib/crawler/fussballde", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return {
    getSpiele: async (_teamId: string, _slug: string, saison: string) => {
      const file = path.join(JSON_ROOT, "dossenheim", `herren1-spiele-saison${saison}.json`);
      return JSON.parse(await fs.readFile(file, "utf-8"));
    },
    getSpielDetails: async (spielId: string, _slug: string) => {
      const file = path.join(JSON_ROOT, "dossenheim", `herren1-spiel-${spielId}.json`);
      return JSON.parse(await fs.readFile(file, "utf-8"));
    }
  };
});

describe.skipIf(isIntegrationDbDisabled)("crawl-matches integration", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it.skip("requires phase 4 merge: inserts all matches and events for a team", async () => {
    // Phase 4 will export `runCrawlForTeam` from
    // lib/inngest/functions/crawl-matches.ts. Once available:
    //
    //   import { runCrawlForTeam } from "@/lib/inngest/functions/crawl-matches";
    //   const { teamIds } = await seedClubFromFixture("dossenheim");
    //   await runCrawlForTeam(teamIds.herren1, "2526");
    //   const db = await getTestDb();
    //   const inserted = await db.select().from(matches).where(eq(matches.teamId, teamIds.herren1));
    //   expect(inserted.length).toBeGreaterThan(0);
    //   const events = await db.select().from(matchEvents);
    //   expect(events.length).toBeGreaterThan(0);
    expect(true).toBe(true);
  });

  it.skip("requires phase 4 merge: is idempotent — second run does not duplicate", async () => {
    // const { teamIds } = await seedClubFromFixture("dossenheim");
    // await runCrawlForTeam(teamIds.herren1, "2526");
    // const db = await getTestDb();
    // const after1 = (await db.select().from(matches)).length;
    // await runCrawlForTeam(teamIds.herren1, "2526");
    // const after2 = (await db.select().from(matches)).length;
    // expect(after2).toBe(after1);
    expect(true).toBe(true);
  });

  it.skip("requires phase 4 merge: skips list items that fail validation", async () => {
    // Verifies that crawl-matches uses `validateSpielListItem` to drop
    // malformed entries before issuing detail requests.
    expect(true).toBe(true);
  });

  it("seeds dossenheim fixture into the test DB", async () => {
    // Smoke-coverage for the seed helper — the only piece of this suite that
    // doesn't depend on Phase 4 helpers.
    const { clubId, teamIds } = await seedClubFromFixture("dossenheim");
    const db = await getTestDb();
    const teamRows = await db.select().from(matches).where(eq(matches.teamId, teamIds.herren1 ?? ""));
    expect(teamRows.length).toBe(0); // no matches yet — only club + teams seeded
    expect(clubId).toBe("c_dossenheim");
    expect(teamIds.herren1).toBeTruthy();
  });
});
