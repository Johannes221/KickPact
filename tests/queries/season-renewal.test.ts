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

  it("Pre-Bump-Klick (Juni): kein next-season-Team → klont auf dieselbe Team-Row mit korrektem Fenster", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      ruleCount: 2,
      withNextSeasonTeam: false
    });

    const result = await clonePledgeForNextSeason(seed.pledgeId, "2627");

    expect(result.pledgeId).not.toBe(seed.pledgeId);
    expect(result.targetTeamId).toBe(seed.teamId); // dieselbe Row — sie WIRD nach dem Bump 2627
    expect(result.targetSaison).toBe("2627");
    expect(result.pledgeRulesCount).toBe(2);

    const [original] = await db
      .select()
      .from(pledges)
      .where(eq(pledges.id, seed.pledgeId));
    const [clone] = await db
      .select()
      .from(pledges)
      .where(eq(pledges.id, result.pledgeId));

    // startsAt = altes endsAt + 1 Tag, endsAt = startsAt + 1 Jahr
    expect(clone.startsAt.getTime()).toBe(
      original.endsAt.getTime() + 24 * 60 * 60 * 1000
    );
    expect(clone.endsAt.getTime()).toBe(
      clone.startsAt.getTime() + 365 * 24 * 60 * 60 * 1000
    );
    expect(clone.teamId).toBe(seed.teamId);
    expect(clone.status).toBe("active");
  });

  it("Doppel-Klick auf dieselbe Row ist idempotent", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      ruleCount: 2,
      withNextSeasonTeam: false
    });

    const first = await clonePledgeForNextSeason(seed.pledgeId, "2627");
    const second = await clonePledgeForNextSeason(seed.pledgeId, "2627");
    expect(second.pledgeId).toBe(first.pledgeId);
    expect(second.pledgeRulesCount).toBe(2);

    // Es gibt genau 2 Pledges (Original + 1 Clone), nicht 3
    const all = await db
      .select({ id: pledges.id })
      .from(pledges)
      .where(eq(pledges.teamId, seed.teamId));
    expect(all.length).toBe(2);
  });

  it("Alt-Pledge auf derselben Row wird NICHT als Clone fehlinterpretiert", async () => {
    // Post-Bump-Szenario: Ziel ist dieselbe Row, auf der die Original-Pledge
    // hängt. Der Idempotenz-Check darf die ALTE Pledge (endsAt <= original.endsAt)
    // nicht als existierenden Clone werten — sonst wäre Renewal ein No-Op.
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      ruleCount: 1,
      withNextSeasonTeam: false
    });

    const result = await clonePledgeForNextSeason(seed.pledgeId, "2627");
    expect(result.pledgeId).not.toBe(seed.pledgeId);
  });

  it("K3: zweiter Pact desselben Sponsors auf demselben Team wird eigenständig geklont", async () => {
    // Review K3 (2026-06-11): kein Unique auf (sponsorId, teamId) — zwei
    // Pacts desselben Sponsors sind legal. Die alte endsAt-Heuristik matchte
    // B's Renewal auf A's Clone → B's Rules wurden nie geklont.
    const seeded = await seedSponsorPledge({ endsAtOffsetDays: 10 });
    const now = new Date();
    const [pledgeB] = await db
      .insert(pledges)
      .values({
        sponsorId: seeded.sponsorId,
        teamId: seeded.teamId,
        status: "active",
        startsAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        monthlyCapCents: null
      })
      .returning({ id: pledges.id });
    await db.insert(pledgeRules).values({
      pledgeId: pledgeB.id,
      triggerType: "clean_sheet",
      amountCents: 700,
      requiresApproval: false
    });

    const cloneA = await clonePledgeForNextSeason(seeded.pledgeId, "2627");
    const cloneB = await clonePledgeForNextSeason(pledgeB.id, "2627");

    expect(cloneB.pledgeId).not.toBe(cloneA.pledgeId);
    expect(cloneB.pledgeRulesCount).toBe(1);

    // Idempotenz bleibt: erneuter Clone von A liefert A's Clone.
    const cloneA2 = await clonePledgeForNextSeason(seeded.pledgeId, "2627");
    expect(cloneA2.pledgeId).toBe(cloneA.pledgeId);

    // Provenance ist gesetzt.
    const [rowA] = await db
      .select({ from: pledges.clonedFromPledgeId })
      .from(pledges)
      .where(eq(pledges.id, cloneA.pledgeId));
    expect(rowA.from).toBe(seeded.pledgeId);
  });

  it("Auflage 1: Unique-Index verhindert zwei Clones derselben Original-Pledge (Race-Schutz)", async () => {
    const seeded = await seedSponsorPledge({ endsAtOffsetDays: 10 });
    const clone = await clonePledgeForNextSeason(seeded.pledgeId, "2627");

    // Direkter Insert simuliert den parallelen Race-Verlierer: der partielle
    // Unique-Index auf cloned_from_pledge_id muss ihn abweisen.
    await expect(
      db.insert(pledges).values({
        sponsorId: seeded.sponsorId,
        teamId: seeded.teamId,
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        clonedFromPledgeId: seeded.pledgeId
      })
    ).rejects.toThrow();

    // Der Clone-Aufruf selbst bleibt idempotent.
    const again = await clonePledgeForNextSeason(seeded.pledgeId, "2627");
    expect(again.pledgeId).toBe(clone.pledgeId);
  });

  it("kopiert Rules inkl. capCents/capPeriod", async () => {
    const seed = await seedSponsorPledge({
      endsAtOffsetDays: 10,
      ruleCount: 0,
      withNextSeasonTeam: true
    });
    await db.insert(pledgeRules).values({
      pledgeId: seed.pledgeId,
      triggerType: "goal_total",
      amountCents: 500,
      capCents: 2000,
      capPeriod: "month",
      requiresApproval: true
    });

    const result = await clonePledgeForNextSeason(seed.pledgeId, "2627");

    const cloneRules = await db
      .select()
      .from(pledgeRules)
      .where(eq(pledgeRules.pledgeId, result.pledgeId));
    expect(cloneRules.length).toBe(1);
    expect(cloneRules[0].capCents).toBe(2000);
    expect(cloneRules[0].capPeriod).toBe("month");
    expect(cloneRules[0].requiresApproval).toBe(true);
    expect(cloneRules[0].amountCents).toBe(500);
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
