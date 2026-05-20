import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { evaluateTriggers } from "@/lib/crawler/triggers";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";

const SHOULD_RUN = process.env.RUN_DB_INTEGRATION === "1";
const itDb = SHOULD_RUN ? it : it.skip;

interface SeededIds {
  userId: string;
  clubId: string;
  teamId: string;
  sponsorId: string;
  pledgeId: string;
  matchId: string;
  matchDate: Date;
}

async function seed(): Promise<SeededIds> {
  const [u] = await db
    .insert(users)
    .values({ id: "u_test_e2e", email: "test_e2e@example.com" })
    .returning();
  const [c] = await db
    .insert(clubs)
    .values({ id: "c_test_e2e", slug: "test-fc-e2e", name: "Test FC E2E" })
    .returning();
  const [t] = await db
    .insert(teams)
    .values({
      clubId: c.id,
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_E2E",
      fussballdeSlug: "test-fc-1-e2e",
      isActive: true
    })
    .returning();
  const [s] = await db
    .insert(sponsors)
    .values({ userId: u.id, displayName: "Tante Erna", type: "familie" })
    .returning();
  const [p] = await db
    .insert(pledges)
    .values({
      sponsorId: s.id,
      teamId: t.id,
      status: "active",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-12-31"),
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
    userId: u.id,
    clubId: c.id,
    teamId: t.id,
    sponsorId: s.id,
    pledgeId: p.id,
    matchId: m.id,
    matchDate
  };
}

async function buildMatchInput(matchId: string, matchDate: Date) {
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

describe("evaluate-match — end-to-end pipeline", () => {
  beforeEach(async () => {
    if (!SHOULD_RUN) return;
    await resetTestDb();
  });

  itDb("3 Tore + 1 Sieg-Pledge → 4 charges in DB", async () => {
    const ids = await seed();

    const rules = await loadActivePledgeRulesForTeam(ids.teamId, ids.matchDate);
    expect(rules).toHaveLength(2);

    const input = await buildMatchInput(ids.matchId, ids.matchDate);
    const proposals = evaluateTriggers(input, rules);
    expect(proposals).toHaveLength(4); // 3 Tore + 1 Sieg

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

    const chargeRows = await db.select().from(charges);
    expect(chargeRows).toHaveLength(4);
    const total = chargeRows.reduce((a, c) => a + c.amountCents, 0);
    expect(total).toBe(3 * 500 + 1000); // 2500 cents
  }, 30_000);

  itDb("Idempotenz: zweimaliger Insert → keine Doubles dank UNIQUE constraints", async () => {
    const ids = await seed();
    const rules = await loadActivePledgeRulesForTeam(ids.teamId, ids.matchDate);
    const input = await buildMatchInput(ids.matchId, ids.matchDate);
    const proposals = evaluateTriggers(input, rules);

    // First insert: all should succeed
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

    // Second insert: all should collide on UNIQUE constraint
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
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("unique") || msg.includes("duplicate")) collisions++;
        else throw e;
      }
    }
    expect(collisions).toBe(4);

    // Still 4 charges total, not 8
    expect(await db.select().from(charges)).toHaveLength(4);
  }, 30_000);
});
