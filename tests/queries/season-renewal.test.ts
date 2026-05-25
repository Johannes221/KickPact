import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  sentNotifications
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  findPledgesEligibleForRenewal,
  hasRenewalNotificationBeenSent,
  findNextSeasonTeam,
  clonePledgeForNextSeason,
  findEligiblePledgesNotYetNotified
} from "@/lib/db/queries/season-renewal";

/**
 * Plan 3 Teil 2 — Tests für Saison-Renewal-Queries.
 */

async function seedSponsorPledge(opts: {
  endsAtOffsetDays: number;
  saison?: string;
  status?: "active" | "ended" | "paused";
  ruleCount?: number;
  withNextSeasonTeam?: boolean;
}) {
  const now = new Date();
  const endsAt = new Date(now.getTime() + opts.endsAtOffsetDays * 24 * 60 * 60 * 1000);

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
    .values({
      slug: `c-${userId.slice(0, 6)}`,
      name: "Test Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id, slug: clubs.slug });

  const fdId = `T_${userId.slice(0, 6)}`;
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: opts.saison ?? "2526",
      fussballdeTeamId: fdId,
      isActive: true
    })
    .returning({ id: teams.id });

  let nextTeamId: string | null = null;
  if (opts.withNextSeasonTeam) {
    const [t2] = await db
      .insert(teams)
      .values({
        clubId: club.id,
        name: "1. Herren",
        saison: "2627",
        fussballdeTeamId: fdId,
        isActive: true
      })
      .returning({ id: teams.id });
    nextTeamId = t2.id;
  }

  const sponsorUserId = createId();
  await db.insert(users).values({
    id: sponsorUserId,
    email: `${sponsorUserId}@test.local`,
    emailVerified: true,
    name: "Sponsor",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [sponsor] = await db
    .insert(sponsors)
    .values({
      userId: sponsorUserId,
      displayName: "ACME",
      type: "familie"
    })
    .returning({ id: sponsors.id });

  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: opts.status ?? "active",
      startsAt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
      endsAt,
      monthlyCapCents: 5000
    })
    .returning({ id: pledges.id });

  const ruleIds: string[] = [];
  for (let i = 0; i < (opts.ruleCount ?? 2); i++) {
    const [r] = await db
      .insert(pledgeRules)
      .values({
        pledgeId: pledge.id,
        triggerType: i === 0 ? "goal_total" : "win",
        amountCents: 500 + i * 100,
        requiresApproval: false
      })
      .returning({ id: pledgeRules.id });
    ruleIds.push(r.id);
  }

  return {
    clubId: club.id,
    clubSlug: club.slug,
    teamId: team.id,
    nextTeamId,
    sponsorId: sponsor.id,
    pledgeId: pledge.id,
    ruleIds
  };
}

describe("findPledgesEligibleForRenewal", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("findet Pledge die in 15 Tagen endet (innerhalb 30d-Window)", async () => {
    const seed = await seedSponsorPledge({ endsAtOffsetDays: 15 });
    const now = new Date();
    const result = await findPledgesEligibleForRenewal(now, 30);
    expect(result.length).toBe(1);
    expect(result[0].pledgeId).toBe(seed.pledgeId);
  });

  it("filtert Pledge die in 60 Tagen endet (außerhalb 30d-Window)", async () => {
    await seedSponsorPledge({ endsAtOffsetDays: 60 });
    const now = new Date();
    const result = await findPledgesEligibleForRenewal(now, 30);
    expect(result.length).toBe(0);
  });

  it("filtert bereits abgelaufene Pledges raus", async () => {
    await seedSponsorPledge({ endsAtOffsetDays: -5 });
    const now = new Date();
    const result = await findPledgesEligibleForRenewal(now, 30);
    expect(result.length).toBe(0);
  });

  it("filtert ended/paused Pledges raus", async () => {
    await seedSponsorPledge({ endsAtOffsetDays: 10, status: "ended" });
    await seedSponsorPledge({ endsAtOffsetDays: 10, status: "paused" });
    const now = new Date();
    const result = await findPledgesEligibleForRenewal(now, 30);
    expect(result.length).toBe(0);
  });
});

describe("hasRenewalNotificationBeenSent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("false wenn noch nicht gesendet", async () => {
    expect(await hasRenewalNotificationBeenSent("p1", "2627")).toBe(false);
  });

  it("true nach Eintrag in sent_notifications", async () => {
    await db.insert(sentNotifications).values({
      kind: "season-renewal",
      key: "p1:2627"
    });
    expect(await hasRenewalNotificationBeenSent("p1", "2627")).toBe(true);
    // Andere Saison nicht
    expect(await hasRenewalNotificationBeenSent("p1", "2728")).toBe(false);
  });
});

describe("findNextSeasonTeam", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("findet Geschwister-Team über fussballde-ID + Saison", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      withNextSeasonTeam: true
    });
    const next = await findNextSeasonTeam(seed.teamId, "2627");
    expect(next).not.toBeNull();
    expect(next!.id).toBe(seed.nextTeamId);
    expect(next!.saison).toBe("2627");
  });

  it("returnt null wenn next-season-Team nicht existiert", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      withNextSeasonTeam: false
    });
    const next = await findNextSeasonTeam(seed.teamId, "2627");
    expect(next).toBeNull();
  });
});

describe("clonePledgeForNextSeason", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("kopiert pledge + rules ins next-season team", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      ruleCount: 3,
      withNextSeasonTeam: true
    });

    const result = await clonePledgeForNextSeason(seed.pledgeId, "2627");

    expect(result.pledgeId).not.toBe(seed.pledgeId);
    expect(result.pledgeRulesCount).toBe(3);
    expect(result.targetTeamId).toBe(seed.nextTeamId);
    expect(result.targetSaison).toBe("2627");

    // Verify rules
    const cloneRules = await db
      .select()
      .from(pledgeRules)
      .where(eq(pledgeRules.pledgeId, result.pledgeId));
    expect(cloneRules.length).toBe(3);

    // Verify pledge has correct team + sponsor
    const [clone] = await db
      .select()
      .from(pledges)
      .where(eq(pledges.id, result.pledgeId));
    expect(clone.teamId).toBe(seed.nextTeamId);
    expect(clone.sponsorId).toBe(seed.sponsorId);
    expect(clone.status).toBe("active");
    expect(clone.monthlyCapCents).toBe(5000);
  });

  it("wirft wenn next-season-Team fehlt", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      withNextSeasonTeam: false
    });
    await expect(
      clonePledgeForNextSeason(seed.pledgeId, "2627")
    ).rejects.toThrow(/keine Mannschaft/i);
  });

  it("ist idempotent — zweiter Call returnt selbe pledgeId", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      ruleCount: 2,
      withNextSeasonTeam: true
    });

    const first = await clonePledgeForNextSeason(seed.pledgeId, "2627");
    const second = await clonePledgeForNextSeason(seed.pledgeId, "2627");
    expect(second.pledgeId).toBe(first.pledgeId);
    expect(second.pledgeRulesCount).toBe(2);
  });

  it("wirft wenn Original-Pledge nicht existiert", async () => {
    await expect(
      clonePledgeForNextSeason("nope", "2627")
    ).rejects.toThrow(/nicht gefunden/i);
  });
});

describe("findEligiblePledgesNotYetNotified", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert nur die ohne sent_notifications-Eintrag", async () => {
    const a = await seedSponsorPledge({ endsAtOffsetDays: 10 });
    const b = await seedSponsorPledge({ endsAtOffsetDays: 10 });

    // a wurde bereits notifiziert für 2627
    await db.insert(sentNotifications).values({
      kind: "season-renewal",
      key: `${a.pledgeId}:2627`
    });

    const now = new Date();
    const eligible = await findEligiblePledgesNotYetNotified(now, "2627", 30);
    expect(eligible.length).toBe(1);
    expect(eligible[0].pledgeId).toBe(b.pledgeId);
  });
});
