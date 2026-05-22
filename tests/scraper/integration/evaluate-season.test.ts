/**
 * Integration test: season-trigger evaluation against the test DB.
 *
 * Seeds a club + team + sponsor with a season_promotion pledge, inserts a
 * `season_results` row marking the team as promoted, and walks through the
 * same charge-insertion path the inngest function `evaluateSeason` uses:
 *
 *   1. Look up active pledges + season-trigger rules for the team.
 *   2. Apply `isTriggerHit(triggerType, params, result)`.
 *   3. Insert charges with `onConflictDoNothing()` — UNIQUE(pledge_rule_id,
 *      saison) guarantees a single charge per saison even on re-runs.
 *
 * The full `runEvaluateSeason({...})` entry point referenced by the plan is
 * not yet exported from lib/inngest/functions/evaluate-season.ts (Phase 4
 * extraction). The skipped case below stays as a reminder.
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
 * Local re-implementation of the evaluateSeason inngest body's core loop —
 * used until Phase 4 exports a callable `runEvaluateSeason`. Stays in lockstep
 * with lib/inngest/functions/evaluate-season.ts.
 */
async function runEvaluateSeasonLocal(opts: { teamId: string; saison: string }): Promise<{
  chargesCreated: number;
}> {
  const db = await getTestDb();
  const [result] = await db
    .select()
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, opts.teamId), eq(seasonResults.saison, opts.saison)))
    .limit(1);
  if (!result) return { chargesCreated: 0 };

  const rows = await db
    .select({ pledge: pledges, rule: pledgeRules, teamSaison: teams.saison })
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

describe.skipIf(isIntegrationDbDisabled)("evaluate-season", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("season_promotion fires once and is idempotent", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "promo",
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

    const r1 = await runEvaluateSeasonLocal({ teamId: teamIds.herren1!, saison: "2425" });
    expect(r1.chargesCreated).toBe(1);

    let rows = await db.select().from(charges);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pledgeRuleId).toBe(ruleId);
    expect(rows[0]?.saison).toBe("2425");
    expect(rows[0]?.matchId).toBeNull();
    expect(rows[0]?.status).toBe("confirmed");

    // Second run: UNIQUE(pledge_rule_id, saison) blocks duplicate.
    const r2 = await runEvaluateSeasonLocal({ teamId: teamIds.herren1!, saison: "2425" });
    expect(r2.chargesCreated).toBe(0);

    rows = await db.select().from(charges);
    expect(rows).toHaveLength(1);
  });

  it("season_no_relegation: relegated=true → no charge", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "no-rel",
      teamDbId: teamIds.herren1!,
      triggerType: "season_no_relegation",
      amountCents: 3000
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 14,
      relegated: true,
      promoted: false
    });
    const { chargesCreated } = await runEvaluateSeasonLocal({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(0);
  });

  it("season_custom: requires_approval → status=pending_approval", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "custom",
      teamDbId: teamIds.herren1!,
      triggerType: "season_custom",
      amountCents: 7500
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      promoted: false,
      relegated: false,
      customNotes: "Most goals in club history"
    });
    const { chargesCreated } = await runEvaluateSeasonLocal({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(1);
    const [row] = await db.select().from(charges);
    expect(row?.status).toBe("pending_approval");
    expect(row?.confirmedAt).toBeNull();
  });

  it("non-season trigger rules are ignored", async () => {
    // A per-match `win` pledge_rule MUST NOT produce a season charge even if
    // the team also won the league.
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "ignore",
      teamDbId: teamIds.herren1!,
      triggerType: "win",
      amountCents: 1000
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 1,
      promoted: true,
      relegated: false
    });
    const { chargesCreated } = await runEvaluateSeasonLocal({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(0);
  });

  it.skip("requires phase 4 merge: full evaluateSeasonTriggers entry point", async () => {
    // Phase 4 will expose runEvaluateSeason(payload) — until then, the local
    // helper above mirrors its core loop. Once available, replace the local
    // call sites here with the real entry point so we test the actual code
    // path, not a clone of it.
    expect(true).toBe(true);
  });
});
