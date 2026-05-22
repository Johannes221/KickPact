/**
 * Integration test: a single season pledge fires once per saison.
 *
 * The UNIQUE(pledge_rule_id, saison) index on `charges` is the invariant
 * under test: two consecutive `evaluate-season` runs for the SAME pledge
 * across DIFFERENT saisons must each insert exactly one charge, while a
 * re-run within the same saison must be a no-op.
 *
 * `runEvaluateSeason` is gated by Phase 3/4; the inline helper below mirrors
 * the inngest function's core loop and stays in sync with
 * lib/inngest/functions/evaluate-season.ts.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  charges,
  pledgeRules,
  pledges,
  seasonResults,
  teams
} from "@/lib/db/schema";
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
import {
  isSeasonTrigger,
  type SeasonTriggerType
} from "@/lib/db/schema/pledges";
import { isTriggerHit } from "@/lib/inngest/functions/evaluate-season";

/**
 * Same body as `runEvaluateSeasonLocal` in evaluate-season.test.ts — kept
 * duplicated rather than shared via a helper module because the inline
 * version is intentionally a temporary stand-in for the Phase 4 export.
 * Once `runEvaluateSeason` lands, both call sites switch over and this
 * helper is deleted.
 */
async function runEvaluateSeasonLocal(opts: {
  teamId: string;
  saison: string;
}): Promise<{ chargesCreated: number }> {
  const db = await getTestDb();
  const [result] = await db
    .select()
    .from(seasonResults)
    .where(
      and(
        eq(seasonResults.teamId, opts.teamId),
        eq(seasonResults.saison, opts.saison)
      )
    )
    .limit(1);
  if (!result) return { chargesCreated: 0 };

  const rows = await db
    .select({
      pledge: pledges,
      rule: pledgeRules,
      teamSaison: teams.saison
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(and(eq(pledges.teamId, opts.teamId), eq(pledges.status, "active")));

  let created = 0;
  for (const r of rows) {
    if (!isSeasonTrigger(r.rule.triggerType)) continue;
    const triggerType = r.rule.triggerType as SeasonTriggerType;
    const params = (r.rule.triggerParamsJson ?? {}) as Record<string, unknown>;
    if (!isTriggerHit(triggerType, params, result)) continue;

    const requiresApproval =
      r.rule.requiresApproval ||
      triggerType === "season_cup_round" ||
      triggerType === "season_custom";

    const inserted = await db
      .insert(charges)
      .values({
        pledgeId: r.pledge.id,
        pledgeRuleId: r.rule.id,
        matchId: null,
        saison: opts.saison,
        triggerType,
        amountCents: r.rule.amountCents,
        status: requiresApproval ? "pending_approval" : "confirmed",
        confirmedAt: requiresApproval ? null : new Date()
      })
      .onConflictDoNothing()
      .returning({ id: charges.id });
    if (inserted.length > 0) created += 1;
  }
  return { chargesCreated: created };
}

describe.skipIf(isIntegrationDbDisabled)("cross-saison pledges", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("season pledge fires once per saison (2425 + 2526)", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    // Pledge created during saison 2425, runs into 2526.
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "x-saison",
      teamDbId: teamIds.herren1!,
      triggerType: "season_promotion",
      amountCents: 5000,
      startsAt: new Date("2024-08-01")
    });

    // Saison 2425 finished → promotion happened.
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 1,
      teamsInLeague: 16,
      promoted: true,
      relegated: false
    });
    const r1 = await runEvaluateSeasonLocal({
      teamId: teamIds.herren1!,
      saison: "2425"
    });
    expect(r1.chargesCreated).toBe(1);

    let rows = await db
      .select()
      .from(charges)
      .where(eq(charges.pledgeRuleId, ruleId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.saison).toBe("2425");

    // Saison 2526 finished → promotion happened AGAIN (rare, but possible).
    // The UNIQUE(pledge_rule_id, saison) index lets this through because
    // the saison tuple is distinct.
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2526",
      finalPosition: 1,
      teamsInLeague: 16,
      promoted: true,
      relegated: false
    });
    const r2 = await runEvaluateSeasonLocal({
      teamId: teamIds.herren1!,
      saison: "2526"
    });
    expect(r2.chargesCreated).toBe(1);

    rows = await db
      .select()
      .from(charges)
      .where(eq(charges.pledgeRuleId, ruleId));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.saison).sort()).toEqual(["2425", "2526"]);
  });

  it("re-run within same saison is idempotent (UNIQUE constraint)", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "x-idem",
      teamDbId: teamIds.herren1!,
      triggerType: "season_promotion",
      amountCents: 5000
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 1,
      teamsInLeague: 16,
      promoted: true,
      relegated: false
    });

    const r1 = await runEvaluateSeasonLocal({
      teamId: teamIds.herren1!,
      saison: "2425"
    });
    const r2 = await runEvaluateSeasonLocal({
      teamId: teamIds.herren1!,
      saison: "2425"
    });
    const r3 = await runEvaluateSeasonLocal({
      teamId: teamIds.herren1!,
      saison: "2425"
    });
    expect(r1.chargesCreated).toBe(1);
    expect(r2.chargesCreated).toBe(0);
    expect(r3.chargesCreated).toBe(0);

    const rows = await db
      .select()
      .from(charges)
      .where(eq(charges.pledgeRuleId, ruleId));
    expect(rows).toHaveLength(1);
  });

  it("pledge starting AFTER a saison still fires when that saison is later evaluated", async () => {
    // A pledge created mid-2526 should still produce a charge if the
    // 2526 saison_results row is inserted later — the trigger walks all
    // active pledges, not pledges whose startsAt < saisonEnd.
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "x-late",
      teamDbId: teamIds.herren1!,
      triggerType: "season_promotion",
      amountCents: 5000,
      startsAt: new Date("2026-03-01")
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2526",
      finalPosition: 2,
      teamsInLeague: 16,
      promoted: true,
      relegated: false
    });

    const { chargesCreated } = await runEvaluateSeasonLocal({
      teamId: teamIds.herren1!,
      saison: "2526"
    });
    expect(chargesCreated).toBe(1);

    const [row] = await db
      .select()
      .from(charges)
      .where(eq(charges.pledgeRuleId, ruleId));
    expect(row?.saison).toBe("2526");
  });

  it.skip("requires phase 4 merge: pledge.endsAt scoping (ended pledge doesn't fire for later saison)", async () => {
    // Once `runEvaluateSeason` honours `pledges.endsAt < saison-Ende-Date`
    // (Phase 4 widens the where-clause beyond `status='active'`), assert:
    // a pledge ending 2025-12-31 must NOT charge for saison 2526.
    expect(true).toBe(true);
  });
});
