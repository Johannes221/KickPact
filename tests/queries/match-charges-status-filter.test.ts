/**
 * Money bug (2026-07-19): match-scoped charge aggregates ignored `charges.status`.
 *
 * When fussball.de re-rates a match, `invalidateChargesForMatch` sets the old
 * charges to `cancelled` and the re-evaluation inserts fresh ones. Because
 * `listMatchCharges` and `getMatchChargesSummaryForTeam` filtered only on
 * `matchId`, both the match-detail page and the match list then showed the SUM
 * OF BOTH generations — the club saw roughly double the money it actually owes.
 *
 * `pending_approval` was mixed into the same total, so unconfirmed manual
 * events read as money already earned. It is now reported separately.
 *
 * Integration against the docker test DB (DATABASE_URL_TEST), gated like the
 * other integration suites.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { charges, matches } from "@/lib/db/schema";
import {
  listMatchCharges,
  getMatchChargesSummaryForTeam
} from "@/lib/db/queries/matches";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  seedClubFromFixture,
  seedSponsorWithPledge
} from "../fixtures/scraper/seed-from-fixtures";

async function seedMatch(teamId: string, spielId: string) {
  const db = await getTestDb();
  const [m] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: spielId,
      datum: new Date("2025-09-01T15:00:00Z"),
      heimName: "FC Dossenheim",
      gastName: "TSV Test",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  return m!;
}

describe.skipIf(isIntegrationDbDisabled)("match charges: status filter", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("listMatchCharges excludes cancelled and reports pending_approval separately", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "mcs-detail",
      teamDbId: teamId,
      triggerType: "goal_total",
      amountCents: 500
    });
    const m = await seedMatch(teamId, "MCS001");

    const base = {
      pledgeId,
      pledgeRuleId: ruleId,
      matchId: m.id,
      triggerType: "goal_total" as const,
      amountCents: 500
    };
    await db.insert(charges).values([
      // Stale generation, superseded by a fussball.de correction.
      { ...base, goalIndex: 1, status: "cancelled", cancelledAt: new Date() },
      { ...base, goalIndex: 2, status: "cancelled", cancelledAt: new Date() },
      // Real money.
      { ...base, goalIndex: 3, status: "confirmed", confirmedAt: new Date() },
      { ...base, goalIndex: 4, status: "invoiced" },
      // Reported, not yet confirmed by the sponsor.
      { ...base, goalIndex: 5, status: "pending_approval" }
    ]);

    const data = await listMatchCharges(m.id);

    // confirmed + invoiced only — not the 2 cancelled, not the pending one.
    expect(data.totalCents).toBe(1000);
    expect(data.pendingCents).toBe(500);

    // The per-trigger and per-sponsor breakdowns must agree with totalCents,
    // otherwise the detail page contradicts its own headline number.
    expect(data.byTrigger).toHaveLength(1);
    expect(data.byTrigger[0]!.totalCents).toBe(1000);
    expect(data.byTrigger[0]!.count).toBe(2);
    expect(data.bySponsor).toHaveLength(1);
    expect(data.bySponsor[0]!.totalCents).toBe(1000);

    // Cancelled charges must not reach the event rows either — the per-event
    // sum in match-events-list would otherwise inherit the same inflation.
    expect(data.rows.map((r) => r.status).sort()).toEqual([
      "confirmed",
      "invoiced",
      "pending_approval"
    ]);
  });

  it("getMatchChargesSummaryForTeam counts only confirmed + invoiced", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "mcs-list",
      teamDbId: teamId,
      triggerType: "goal_total",
      amountCents: 500
    });
    const m = await seedMatch(teamId, "MCS002");

    const base = {
      pledgeId,
      pledgeRuleId: ruleId,
      matchId: m.id,
      triggerType: "goal_total" as const,
      amountCents: 500
    };
    await db.insert(charges).values([
      { ...base, goalIndex: 1, status: "cancelled", cancelledAt: new Date() },
      { ...base, goalIndex: 2, status: "pending_approval" },
      { ...base, goalIndex: 3, status: "confirmed", confirmedAt: new Date() },
      { ...base, goalIndex: 4, status: "invoiced" }
    ]);

    const summary = await getMatchChargesSummaryForTeam(teamId);

    expect(summary.get(m.id)).toBe(1000);
  });

  it("a match whose charges are ALL cancelled reports no money at all", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "mcs-zero",
      teamDbId: teamId,
      triggerType: "goal_total",
      amountCents: 500
    });
    const m = await seedMatch(teamId, "MCS003");

    await db.insert(charges).values([
      {
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: m.id,
        goalIndex: 1,
        triggerType: "goal_total" as const,
        amountCents: 500,
        status: "cancelled",
        cancelledAt: new Date()
      }
    ]);

    const data = await listMatchCharges(m.id);
    expect(data.totalCents).toBe(0);
    expect(data.pendingCents).toBe(0);
    expect(data.rows).toHaveLength(0);
    expect(data.byTrigger).toHaveLength(0);
    expect(data.bySponsor).toHaveLength(0);

    // The list must agree: a fully-cancelled match shows no entry (or zero),
    // never the stale amount.
    const summary = await getMatchChargesSummaryForTeam(teamId);
    expect(summary.get(m.id) ?? 0).toBe(0);
  });
});
