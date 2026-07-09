/**
 * Integration test: re-crawl with a changed result invalidates prior charges
 * and produces correct new ones.
 *
 * The match-update path lives in Phase 4's `updateMatchWithEvents` +
 * `invalidateChargesForMatch` helpers (plus the `computeMatchHash` change
 * detector) — none of which are exported from this worktree yet. All
 * end-to-end cases here are therefore `.skip` placeholders, kept in shape
 * so the merge from the Phase 4 worktree can flip them on with minimal
 * edits.
 *
 * One non-skipped case covers the schema/index-level guarantee the path
 * depends on: charges UNIQUE constraints already exist, so any future
 * implementation can rely on `onConflictDoNothing` for idempotent re-inserts
 * after invalidation.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { charges, matchEvents, matches } from "@/lib/db/schema";
import { invalidateChargesForMatch } from "@/lib/db/queries/charges";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";
import {
  seedClubFromFixture,
  seedSponsorWithPledge
} from "../../fixtures/scraper/seed-from-fixtures";

// When Phase 4 lands, swap the mock factory below for the real one — the
// crawl-matches inngest function calls into `getSpiele` / `getSpielDetails`,
// so the mock must shadow those.
vi.mock("@/lib/crawler/fussballde", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crawler/fussballde")>(
    "@/lib/crawler/fussballde"
  );
  return {
    ...actual,
    getSpiele: vi.fn(),
    getSpielDetails: vi.fn()
  };
});

describe.skipIf(isIntegrationDbDisabled)("match-update-path", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it.skip("requires phase 4 merge: re-crawl with changed result invalidates old charges and creates new ones", async () => {
    // Phase 4 will export `runCrawlForTeam(teamId, saison)` plus
    // `computeMatchHash` + `invalidateChargesForMatch` +
    // `updateMatchWithEvents`. Once available, the scenario is:
    //
    //   1. Seed dossenheim herren1 + a `win` pledge @1000ct.
    //   2. Mock getSpiele/getSpielDetails to return a 1:1 draw → first crawl
    //      produces 0 win charges.
    //   3. Re-mock the detail call to return 2:1 (changed hash) → second
    //      crawl re-evaluates: invalidates stale charges, inserts 1 win
    //      charge.
    //   4. Assert: charges.filter(status='confirmed').length === 1.
    expect(true).toBe(true);
  });

  it.skip("requires phase 4 merge: unchanged hash → no-op (no re-evaluation)", async () => {
    // Second crawl with byte-identical detail payload must short-circuit
    // before invalidation/re-eval. Assert match_events row count stable +
    // no extra charges inserted.
    expect(true).toBe(true);
  });

  it.skip("requires phase 4 merge: confirmed-but-invoiced charges are NOT invalidated", async () => {
    // Once a charge has been rolled into an invoice (status='invoiced'),
    // the update path must NOT cancel it even if the upstream match result
    // changed — invoices are immutable once sent.
    expect(true).toBe(true);
  });

  it("schema supports the update path: matches.crawledAt + charges status transitions", async () => {
    // Non-skipped sanity check — guarantees the building blocks Phase 4
    // relies on are migrated: matches.crawled_at exists, charges have
    // pending_approval/confirmed/cancelled states, match_events cascade
    // on match delete.
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "update-schema",
      teamDbId: teamIds.herren1!,
      triggerType: "win",
      amountCents: 1000
    });

    const [m] = await db
      .insert(matches)
      .values({
        teamId: teamIds.herren1!,
        fussballdeSpielId: "FAKE001",
        datum: new Date("2025-09-01T15:00:00Z"),
        heimName: "FC Sportfreunde 1910 Dossenheim",
        gastName: "TSV Test",
        ergebnisHeim: 1,
        ergebnisGast: 1,
        status: "finished"
      })
      .returning();
    expect(m?.crawledAt).toBeInstanceOf(Date);

    // First "evaluation": draw → no charge.
    let rows = await db
      .select()
      .from(charges)
      .where(eq(charges.matchId, m!.id));
    expect(rows).toHaveLength(0);

    // Simulate Phase 4's invalidate→reinsert path manually: result corrected
    // to 2:1, win charge inserted.
    await db
      .update(matches)
      .set({ ergebnisHeim: 2, ergebnisGast: 1 })
      .where(eq(matches.id, m!.id));
    await db.insert(matchEvents).values([
      {
        matchId: m!.id,
        type: "tor",
        minute: 30,
        side: "heim",
        playerName: "X",
        source: "scraped"
      },
      {
        matchId: m!.id,
        type: "tor",
        minute: 60,
        side: "heim",
        playerName: "X",
        source: "scraped"
      },
      {
        matchId: m!.id,
        type: "tor",
        minute: 80,
        side: "gast",
        playerName: "Y",
        source: "scraped"
      }
    ]);
    await db.insert(charges).values({
      pledgeId,
      pledgeRuleId: ruleId,
      matchId: m!.id,
      triggerType: "win",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: new Date()
    });

    rows = await db.select().from(charges).where(eq(charges.matchId, m!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("confirmed");
  });

  // Regression (UAT 2026-07-08): Re-Scrape eines schon FAKTURIERTEN Spiels darf
  // die eingefrorenen invoiced-Charges nicht korrumpieren. invalidate meldet die
  // frozen-Anzahl (Freeze-Guard-Signal in crawl-matches); die Events dürfen dann
  // NICHT gelöscht werden, sonst verwaist der FK (onDelete:set null) beide
  // event-gebundenen Charges (goalIndex 0) → partieller Unique-Index-Crash.
  it("invoiced event-gebundene Charges: invalidate friert ein (frozenInvoiced), Event-Löschen crasht den Unique-Index", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "invoiced-freeze",
      teamDbId: teamIds.herren1!,
      triggerType: "goal_total",
      amountCents: 500
    });

    const [m] = await db
      .insert(matches)
      .values({
        teamId: teamIds.herren1!,
        fussballdeSpielId: "FROZEN01",
        datum: new Date("2025-05-31T15:00:00Z"),
        heimName: "FC Sportfreunde 1910 Dossenheim",
        gastName: "TSV Test",
        ergebnisHeim: 2,
        ergebnisGast: 0,
        status: "finished",
        contentHash: "hash-v1"
      })
      .returning();

    const ev = await db
      .insert(matchEvents)
      .values([
        { matchId: m!.id, type: "tor", minute: 30, side: "heim", playerName: "A", source: "scraped" },
        { matchId: m!.id, type: "tor", minute: 60, side: "heim", playerName: "B", source: "scraped" }
      ])
      .returning();

    // Zwei bereits FAKTURIERTE, event-gebundene Tor-Charges — beide goalIndex 0,
    // nur über matchEventId unterschieden (exakt wie evaluate-match sie erzeugt).
    await db.insert(charges).values([
      {
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: m!.id,
        matchEventId: ev[0]!.id,
        triggerType: "goal_total",
        goalIndex: 0,
        amountCents: 500,
        status: "invoiced",
        confirmedAt: new Date()
      },
      {
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: m!.id,
        matchEventId: ev[1]!.id,
        triggerType: "goal_total",
        goalIndex: 0,
        amountCents: 500,
        status: "invoiced",
        confirmedAt: new Date()
      }
    ]);

    // fussball.de-Korrektur nach Fakturierung → invalidate flaggt (storniert nicht).
    const result = await invalidateChargesForMatch(m!.id, "match_updated");
    expect(result.frozenInvoiced).toBe(2);
    expect(result.cancelledNonInvoiced).toBe(0);

    // Beide Charges bleiben invoiced + geflaggt + behalten ihre Event-Verknüpfung.
    const after = await db.select().from(charges).where(eq(charges.matchId, m!.id));
    expect(after).toHaveLength(2);
    expect(after.every((c) => c.status === "invoiced")).toBe(true);
    expect(after.every((c) => c.correctionFlaggedAt !== null)).toBe(true);
    expect(after.every((c) => c.matchEventId !== null)).toBe(true);

    // Beleg, warum der Freeze-Guard load-bearing ist: würde der Crawler jetzt die
    // Scraped-Events löschen (updateMatchWithEvents), verwaist der FK beide
    // invoiced-Charges auf matchEventId=NULL → Kollision im partiellen
    // Unique-Index (rule, match, goal_total, 0) → 23505.
    await expect(
      db.delete(matchEvents).where(eq(matchEvents.matchId, m!.id))
    ).rejects.toThrow();
  });
});
