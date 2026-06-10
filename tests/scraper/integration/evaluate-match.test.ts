/**
 * Integration test: evaluate-match end-to-end against test DB.
 *
 * Replaces tests/inngest/evaluate-match.test.ts which ran against the dev DB
 * gated by a RUN_DB_INTEGRATION flag. The harness is now the isolated
 * docker-compose test DB so this suite runs in CI by default.
 *
 * Covers the trigger-evaluation + charge-persistence flow exercised by
 * lib/inngest/functions/evaluate-match.ts:
 *   1. Multi-trigger scenario (3 goals + 1 win pledge → 4 charges).
 *   2. Idempotency via UNIQUE constraints.
 *   3. Monthly-cap enforcement across multiple matches.
 *   4. Manual triggers produce charges with status=pending_approval +
 *      event_approvals rows.
 *
 * The cap + approval cases that need the full inngest core path are skipped
 * until Phase 4 lands and exports `runEvaluateMatch(matchId, teamId)`. Until
 * then, schema- and query-level building blocks are exercised so any
 * regression in the underlying primitives is caught.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  eventApprovals
} from "@/lib/db/schema";
import { evaluateTriggers } from "@/lib/crawler/triggers";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";
import { isUniqueViolation } from "@/lib/db/errors";
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

interface SeededIds {
  userId: string;
  clubId: string;
  teamId: string;
  sponsorId: string;
  pledgeId: string;
  matchId: string;
  matchDate: Date;
}

async function seedBaseMatch(): Promise<SeededIds> {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_test_e2e", email: "test_e2e@example.com" });
  await db
    .insert(clubs)
    .values({ id: "c_test_e2e", slug: "test-fc-e2e", name: "Test FC E2E" });
  const [t] = await db
    .insert(teams)
    .values({
      clubId: "c_test_e2e",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_E2E",
      fussballdeSlug: "test-fc-1-e2e",
      isActive: true
    })
    .returning();
  const [s] = await db
    .insert(sponsors)
    .values({ userId: "u_test_e2e", displayName: "Tante Erna", type: "familie" })
    .returning();
  const [p] = await db
    .insert(pledges)
    .values({
      sponsorId: s.id,
      teamId: t.id,
      status: "active",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2099-12-31"),
      monthlyCapCents: null
    })
    .returning();
  await db.insert(pledgeRules).values([
    {
      pledgeId: p.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: 500,
      requiresApproval: false
    },
    {
      pledgeId: p.id,
      triggerType: "win",
      triggerParamsJson: {},
      amountCents: 1000,
      requiresApproval: false
    }
  ]);

  const matchDate = new Date("2026-05-10T15:00:00Z");
  const [m] = await db
    .insert(matches)
    .values({
      teamId: t.id,
      fussballdeSpielId: "SPIEL_E2E",
      datum: matchDate,
      heimName: "1. Herren",
      gastName: "FC Gegner",
      ergebnisHeim: 3,
      ergebnisGast: 1,
      halbzeitHeim: 2,
      halbzeitGast: 0,
      status: "finished"
    })
    .returning();
  await db.insert(matchEvents).values([
    { matchId: m.id, type: "tor", minute: 12, side: "heim", playerName: "S", source: "scraped" },
    { matchId: m.id, type: "tor", minute: 33, side: "heim", playerName: "M", source: "scraped" },
    { matchId: m.id, type: "tor", minute: 60, side: "gast", playerName: "G", source: "scraped" },
    { matchId: m.id, type: "tor", minute: 87, side: "heim", playerName: "S", source: "scraped" }
  ]);

  return {
    userId: "u_test_e2e",
    clubId: "c_test_e2e",
    teamId: t.id,
    sponsorId: s.id,
    pledgeId: p.id,
    matchId: m.id,
    matchDate
  };
}

async function buildMatchInput(matchId: string) {
  const db = await getTestDb();
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
  return {
    id: m.id,
    teamSide: "heim" as const,
    ergebnisHeim: m.ergebnisHeim ?? 0,
    ergebnisGast: m.ergebnisGast ?? 0,
    halbzeitHeim: m.halbzeitHeim,
    halbzeitGast: m.halbzeitGast,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      subtype: e.subtype,
      minute: e.minute,
      side: e.side,
      playerName: e.playerName,
      playerId: e.playerId,
      source: e.source
    }))
  };
}

describe.skipIf(isIntegrationDbDisabled)("evaluate-match — end-to-end pipeline", () => {
  beforeAll(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("3 Tore + 1 Sieg-Pledge → 4 charges in DB", async () => {
    const ids = await seedBaseMatch();
    const db = await getTestDb();

    const rules = await loadActivePledgeRulesForTeam(ids.teamId, ids.matchDate);
    expect(rules).toHaveLength(2);

    const input = await buildMatchInput(ids.matchId);
    const proposals = evaluateTriggers(input, rules);
    expect(proposals).toHaveLength(4);

    for (const prop of proposals) {
      await db.insert(charges).values({
        pledgeId: prop.pledgeId,
        pledgeRuleId: prop.pledgeRuleId,
        matchId: prop.matchId,
        matchEventId: prop.matchEventId,
        triggerType: prop.triggerType,
        amountCents: prop.amountCents,
        status: "confirmed",
        confirmedAt: new Date()
      });
    }

    const rows = await db.select().from(charges);
    expect(rows).toHaveLength(4);
    const total = rows.reduce((a, c) => a + c.amountCents, 0);
    expect(total).toBe(3 * 500 + 1000);
  });

  it("Idempotenz: zweimaliger Insert → keine Doubles dank UNIQUE constraints", async () => {
    const ids = await seedBaseMatch();
    const db = await getTestDb();
    const rules = await loadActivePledgeRulesForTeam(ids.teamId, ids.matchDate);
    const input = await buildMatchInput(ids.matchId);
    const proposals = evaluateTriggers(input, rules);

    for (const prop of proposals) {
      await db.insert(charges).values({
        pledgeId: prop.pledgeId,
        pledgeRuleId: prop.pledgeRuleId,
        matchId: prop.matchId,
        matchEventId: prop.matchEventId,
        triggerType: prop.triggerType,
        amountCents: prop.amountCents,
        status: "confirmed",
        confirmedAt: new Date()
      });
    }
    expect(await db.select().from(charges)).toHaveLength(4);

    let collisions = 0;
    for (const prop of proposals) {
      try {
        await db.insert(charges).values({
          pledgeId: prop.pledgeId,
          pledgeRuleId: prop.pledgeRuleId,
          matchId: prop.matchId,
          matchEventId: prop.matchEventId,
          triggerType: prop.triggerType,
          amountCents: prop.amountCents,
          status: "confirmed",
          confirmedAt: new Date()
        });
      } catch (e) {
        if (isUniqueViolation(e)) collisions++;
        else throw e;
      }
    }
    expect(collisions).toBe(4);
    expect(await db.select().from(charges)).toHaveLength(4);
  });
});

describe.skipIf(isIntegrationDbDisabled)("evaluate-match: monthly cap enforcement", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it.skip("requires phase 4 merge: stops charges when monthly cap is reached across multiple matches", async () => {
    // Needs `runEvaluateMatch(matchId, teamId)` exported from the inngest
    // module. Then drive 3 same-month matches with goal_total pledge +
    // monthlyCapCents=1000 and assert SUM(charges.amountCents) <= 1000.
    expect(true).toBe(true);
  });

  it("getMonthlyChargedCents + getPledgeMonthlyCap return cap state", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId } = await seedSponsorWithPledge({
      sponsorKey: "cap-sanity",
      teamDbId: teamIds.herren1!,
      triggerType: "goal_total",
      amountCents: 500,
      monthlyCapCents: 1000
    });
    const { getMonthlyChargedCents, getPledgeMonthlyCap } = await import(
      "@/lib/db/queries/evaluation"
    );
    expect(await getPledgeMonthlyCap(pledgeId)).toBe(1000);
    expect(await getMonthlyChargedCents(pledgeId, new Date("2026-05-15"))).toBe(0);
  });
});

describe.skipIf(isIntegrationDbDisabled)("evaluate-match: manual approval flow", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it.skip("requires phase 4 merge: manual triggers create charges with status=pending_approval and event_approvals row", async () => {
    // Drives runEvaluateMatch on a match whose pledge_rule has
    // triggerType=special_goal + requiresApproval=true. Asserts:
    //   - charges row inserted with status='pending_approval', confirmedAt=null
    //   - event_approvals row inserted with status='pending'
    expect(true).toBe(true);
  });

  it("schema supports pending_approval + event_approvals workflow", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "appr-schema",
      teamDbId: teamIds.herren1!,
      triggerType: "special_goal",
      amountCents: 500,
      requiresApproval: true
    });

    const [m] = await db
      .insert(matches)
      .values({
        teamId: teamIds.herren1!,
        fussballdeSpielId: "SPIEL_APPR",
        datum: new Date("2026-05-10T15:00:00Z"),
        heimName: "Test",
        gastName: "Opp",
        ergebnisHeim: 1,
        ergebnisGast: 0,
        status: "finished"
      })
      .returning();
    const [ev] = await db
      .insert(matchEvents)
      .values({
        matchId: m.id,
        type: "spezial",
        subtype: "freistosstor",
        side: "heim",
        playerName: "X",
        source: "manual"
      })
      .returning();

    await db.insert(charges).values({
      pledgeId,
      pledgeRuleId: ruleId,
      matchId: m.id,
      matchEventId: ev.id,
      triggerType: "special_goal",
      amountCents: 500,
      status: "pending_approval"
    });
    await db.insert(eventApprovals).values({
      matchEventId: ev.id,
      pledgeRuleId: ruleId,
      status: "pending",
      expiresAt: new Date("2026-06-10T00:00:00Z")
    });

    const pending = await db
      .select()
      .from(charges)
      .where(and(eq(charges.status, "pending_approval"), eq(charges.matchId, m.id)));
    expect(pending).toHaveLength(1);
    const approvals = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.matchEventId, ev.id));
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.status).toBe("pending");
  });
});
