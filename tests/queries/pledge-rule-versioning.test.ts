import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsors, pledges, pledgeRules } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";

/**
 * SECURITY (H4 / H4b / H4c): Term-Versionierung im Rule-Loader.
 *
 * Der Evaluator (loadActivePledgeRulesForTeam) muss:
 *  - aktive Wetten im offenen Fenster laden,
 *  - BEENDETE Pledges weiterhin für Spiele VOR `endsAt` laden (H4c) — sonst
 *    unterdrückt ein Beenden nach Anpfiff legitime Charges,
 *  - GELÖSCHTE Regeln (active=false MIT effectiveUntil) für Spiele VOR
 *    `effectiveUntil` laden (H4b), künftige nicht,
 *  - Alt-Style-Soft-Deletes (active=false OHNE effectiveUntil) NIE laden.
 */

const MATCH = new Date("2026-03-15T12:00:00Z");
const SEASON_START = new Date("2025-08-01T00:00:00Z");
const EPOCH = new Date("1970-01-01T00:00:00Z");

async function seed(opts: {
  pledgeStatus: "active" | "ended";
  endsAt: Date;
  ruleActive: boolean;
  effectiveUntil: Date | null;
}): Promise<string> {
  const tag = createId().slice(0, 8);
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.local`,
    emailVerified: true,
    name: "Test",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [club] = await db
    .insert(clubs)
    .values({ slug: `c-${tag}`, name: "C", onboardingStatus: "completed" })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "T",
      saison: "2526",
      fussballdeTeamId: `T${tag}`,
      fussballdeSlug: `t-${tag}`,
      isActive: true
    })
    .returning({ id: teams.id });
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId, displayName: "S", type: "familie" })
    .returning({ id: sponsors.id });
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: opts.pledgeStatus,
      startsAt: SEASON_START,
      endsAt: opts.endsAt
    })
    .returning({ id: pledges.id });
  await db.insert(pledgeRules).values({
    pledgeId: pledge.id,
    triggerType: "goal_total",
    amountCents: 500,
    active: opts.ruleActive,
    effectiveFrom: EPOCH,
    effectiveUntil: opts.effectiveUntil
  });
  return team.id;
}

describe("loadActivePledgeRulesForTeam — H4 Term-Versionierung", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("aktive Wette, offenes Fenster → geladen", async () => {
    const teamId = await seed({
      pledgeStatus: "active",
      endsAt: new Date("2026-06-30"),
      ruleActive: true,
      effectiveUntil: null
    });
    expect(await loadActivePledgeRulesForTeam(teamId, MATCH)).toHaveLength(1);
  });

  it("H4c: beendete Wette, Spiel VOR endsAt → noch geladen", async () => {
    const teamId = await seed({
      pledgeStatus: "ended",
      endsAt: new Date("2026-03-20"),
      ruleActive: true,
      effectiveUntil: null
    });
    expect(await loadActivePledgeRulesForTeam(teamId, MATCH)).toHaveLength(1);
  });

  it("H4c: beendete Wette, Spiel NACH endsAt → nicht geladen", async () => {
    const teamId = await seed({
      pledgeStatus: "ended",
      endsAt: new Date("2026-03-10"),
      ruleActive: true,
      effectiveUntil: null
    });
    expect(await loadActivePledgeRulesForTeam(teamId, MATCH)).toHaveLength(0);
  });

  it("H4b: gelöschte Regel (active=false, effectiveUntil>matchDate) → noch geladen", async () => {
    const teamId = await seed({
      pledgeStatus: "active",
      endsAt: new Date("2026-06-30"),
      ruleActive: false,
      effectiveUntil: new Date("2026-03-20")
    });
    expect(await loadActivePledgeRulesForTeam(teamId, MATCH)).toHaveLength(1);
  });

  it("H4b: gelöschte Regel, effectiveUntil<matchDate → nicht geladen", async () => {
    const teamId = await seed({
      pledgeStatus: "active",
      endsAt: new Date("2026-06-30"),
      ruleActive: false,
      effectiveUntil: new Date("2026-03-10")
    });
    expect(await loadActivePledgeRulesForTeam(teamId, MATCH)).toHaveLength(0);
  });

  it("Alt-Style Soft-Delete (active=false ohne effectiveUntil) → nie geladen", async () => {
    const teamId = await seed({
      pledgeStatus: "active",
      endsAt: new Date("2026-06-30"),
      ruleActive: false,
      effectiveUntil: null
    });
    expect(await loadActivePledgeRulesForTeam(teamId, MATCH)).toHaveLength(0);
  });
});
