import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  teamLicenses,
  subscriptions,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  charges
} from "@/lib/db/schema";
import {
  getPlatformKpis,
  getTopClubsThisMonth,
  listVereineForAdmin,
  listUsersForAdmin,
  getVereinDetail,
  getUserDetail
} from "@/lib/db/queries/platform-stats";
import { resetTestDb } from "../setup/db";

async function seedUser(suffix: string): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `u-${suffix}-${id}@kickpact.local`,
    emailVerified: true,
    name: `User ${suffix}`,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return id;
}

async function seedClub(hint: string): Promise<string> {
  const id = createId();
  await db.insert(clubs).values({
    id,
    slug: `${hint}-${id.slice(0, 6)}`,
    name: `Club ${hint}`,
    ort: `Stadt-${hint}`
  });
  return id;
}

async function seedSubscription(
  clubId: string,
  opts: {
    status?: "trialing" | "active" | "past_due" | "cancelled" | "incomplete" | "paused";
    billingCycle?: "monthly" | "season" | "annual";
    trialEndsAt?: Date | null;
    updatedAt?: Date;
    createdAt?: Date;
  } = {}
) {
  await db.insert(subscriptions).values({
    clubId,
    status: opts.status ?? "active",
    billingCycle: opts.billingCycle ?? "monthly",
    trialEndsAt: opts.trialEndsAt ?? null,
    updatedAt: opts.updatedAt ?? new Date(),
    createdAt: opts.createdAt ?? new Date()
  });
}

async function seedTeam(clubId: string, name = "1. Mannschaft"): Promise<string> {
  const id = createId();
  await db.insert(teams).values({
    id,
    clubId,
    name,
    saison: "2025/26",
    isActive: true
  });
  return id;
}

async function seedTeamLicense(
  clubId: string,
  teamId: string,
  plan: "basic" | "pro" | "verein" = "pro"
) {
  const id = createId();
  await db.insert(teamLicenses).values({
    id,
    subscriptionClubId: clubId,
    teamId,
    plan,
    status: "active"
  });
}

async function seedSponsor(userId: string): Promise<string> {
  const id = createId();
  await db.insert(sponsors).values({
    id,
    userId,
    displayName: `Sponsor-${id.slice(0, 4)}`,
    type: "familie"
  });
  return id;
}

async function seedPledge(sponsorId: string, teamId: string): Promise<string> {
  const [row] = await db
    .insert(pledges)
    .values({
      sponsorId,
      teamId,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    })
    .returning({ id: pledges.id });
  if (!row) throw new Error("seedPledge: no row returned");
  return row.id;
}

async function seedPledgeRule(pledgeId: string, amountCents: number): Promise<string> {
  const id = createId();
  await db.insert(pledgeRules).values({
    id,
    pledgeId,
    triggerType: "goal_total",
    amountCents
  });
  return id;
}

async function seedCharge(opts: {
  pledgeId: string;
  pledgeRuleId: string;
  amountCents: number;
  triggerType?: "goal_total" | "win" | "draw";
  status?: "pending_approval" | "confirmed" | "invoiced" | "cancelled";
  createdAt?: Date;
}) {
  await db.insert(charges).values({
    pledgeId: opts.pledgeId,
    pledgeRuleId: opts.pledgeRuleId,
    triggerType: opts.triggerType ?? "goal_total",
    amountCents: opts.amountCents,
    status: opts.status ?? "confirmed",
    createdAt: opts.createdAt ?? new Date()
  });
}

describe("platform-stats", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("getPlatformKpis returns sane defaults on empty DB", async () => {
    const k = await getPlatformKpis();
    expect(k.activeClubs).toBe(0);
    expect(k.mrrCents).toBe(0);
    expect(k.trialToPaidPercent).toBe(0);
    expect(k.churnPercent).toBe(0);
    expect(k.avgPledgeAmountCents).toBe(0);
    expect(k.topTrigger).toBeNull();
    expect(k.mrrSeries.length).toBe(6);
    expect(k.mrrSeries.every((m) => m.mrrCents === 0)).toBe(true);
  });

  it("getPlatformKpis counts active clubs and aggregates MRR", async () => {
    const club1 = await seedClub("a");
    const team1 = await seedTeam(club1);
    await seedSubscription(club1, { status: "active", billingCycle: "monthly" });
    await seedTeamLicense(club1, team1, "pro"); // 1900 monthly

    const club2 = await seedClub("b");
    const team2 = await seedTeam(club2);
    await seedSubscription(club2, { status: "active", billingCycle: "monthly" });
    await seedTeamLicense(club2, team2, "basic"); // 500 monthly

    const club3 = await seedClub("c");
    await seedSubscription(club3, { status: "trialing", billingCycle: "monthly" });

    const k = await getPlatformKpis();
    expect(k.activeClubs).toBe(2);
    // 1900 + 500 = 2400
    expect(k.mrrCents).toBe(2400);
  });

  it("getPlatformKpis computes avg pledge amount across active pledges", async () => {
    const userA = await seedUser("a");
    const clubA = await seedClub("x");
    const teamA = await seedTeam(clubA);
    const sponsorA = await seedSponsor(userA);
    const pledgeA = await seedPledge(sponsorA, teamA);
    await seedPledgeRule(pledgeA, 500); // 5€
    await seedPledgeRule(pledgeA, 1500); // 15€

    const k = await getPlatformKpis();
    expect(k.avgPledgeAmountCents).toBe(1000); // (500+1500)/2
  });

  it("getPlatformKpis identifies top trigger by charge-count", async () => {
    const userA = await seedUser("trig");
    const clubA = await seedClub("trig");
    const teamA = await seedTeam(clubA);
    const sponsorA = await seedSponsor(userA);
    const pledgeA = await seedPledge(sponsorA, teamA);
    const ruleA = await seedPledgeRule(pledgeA, 100);

    // 3× goal_total, 1× win
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 100 });
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 100 });
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 100 });
    await seedCharge({
      pledgeId: pledgeA,
      pledgeRuleId: ruleA,
      amountCents: 100,
      triggerType: "win"
    });

    const k = await getPlatformKpis();
    expect(k.topTrigger?.triggerType).toBe("goal_total");
    expect(k.topTrigger?.chargeCount).toBe(3);
  });

  it("getTopClubsThisMonth ranks clubs by current-month charge total", async () => {
    const userA = await seedUser("top");
    const clubA = await seedClub("ranked-a");
    const teamA = await seedTeam(clubA);
    const sponsorA = await seedSponsor(userA);
    const pledgeA = await seedPledge(sponsorA, teamA);
    const ruleA = await seedPledgeRule(pledgeA, 100);
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 1000 });
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 2000 });

    const clubB = await seedClub("ranked-b");
    const teamB = await seedTeam(clubB);
    const pledgeB = await seedPledge(sponsorA, teamB);
    const ruleB = await seedPledgeRule(pledgeB, 100);
    await seedCharge({ pledgeId: pledgeB, pledgeRuleId: ruleB, amountCents: 500 });

    const top = await getTopClubsThisMonth(5);
    expect(top.length).toBe(2);
    expect(top[0].clubId).toBe(clubA);
    expect(top[0].totalCents).toBe(3000);
    expect(top[1].clubId).toBe(clubB);
    expect(top[1].totalCents).toBe(500);
  });

  it("getTopClubsThisMonth excludes cancelled charges", async () => {
    const userA = await seedUser("excl");
    const clubA = await seedClub("excl");
    const teamA = await seedTeam(clubA);
    const sponsorA = await seedSponsor(userA);
    const pledgeA = await seedPledge(sponsorA, teamA);
    const ruleA = await seedPledgeRule(pledgeA, 100);
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 500 });
    await seedCharge({
      pledgeId: pledgeA,
      pledgeRuleId: ruleA,
      amountCents: 9999,
      status: "cancelled"
    });

    const top = await getTopClubsThisMonth(5);
    expect(top.length).toBe(1);
    expect(top[0].totalCents).toBe(500);
  });

  it("listVereineForAdmin paginates + filters by search", async () => {
    await seedClub("alpha");
    await seedClub("beta");
    await seedClub("gamma");

    const all = await listVereineForAdmin({ pagination: { page: 1, pageSize: 10 } });
    expect(all.total).toBe(3);

    const filtered = await listVereineForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { search: "alph" }
    });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].name).toContain("alpha");
  });

  it("listVereineForAdmin filters by verified", async () => {
    const clubVerifiedId = await seedClub("ver");
    await db
      .update(clubs)
      .set({ verifiedAt: new Date() })
      .where((await import("drizzle-orm")).eq(clubs.id, clubVerifiedId));
    await seedClub("notver");

    const yes = await listVereineForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { verified: "yes" }
    });
    expect(yes.total).toBe(1);
    expect(yes.rows[0].verifiedAt).not.toBeNull();

    const no = await listVereineForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { verified: "no" }
    });
    expect(no.total).toBe(1);
    expect(no.rows[0].verifiedAt).toBeNull();
  });

  it("listVereineForAdmin returns team / member / sponsor counts per club", async () => {
    const userA = await seedUser("c1");
    const clubA = await seedClub("counted");
    const teamA1 = await seedTeam(clubA, "1. Herren");
    const teamA2 = await seedTeam(clubA, "2. Herren");
    await db.insert(clubMemberships).values({ userId: userA, clubId: clubA, role: "admin" });
    const sponsorA = await seedSponsor(userA);
    await seedPledge(sponsorA, teamA1);

    const res = await listVereineForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { search: "counted" }
    });
    expect(res.rows.length).toBe(1);
    const row = res.rows[0];
    expect(row.teamCount).toBe(2);
    expect(row.memberCount).toBe(1);
    expect(row.sponsorCount).toBe(1);
  });

  it("listUsersForAdmin filters by hasSponsor", async () => {
    const userWith = await seedUser("with");
    await seedSponsor(userWith);
    await seedUser("without");

    const all = await listUsersForAdmin({ pagination: { page: 1, pageSize: 10 } });
    expect(all.total).toBe(2);

    const onlySponsors = await listUsersForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { hasSponsor: true }
    });
    expect(onlySponsors.total).toBe(1);
    expect(onlySponsors.rows[0].id).toBe(userWith);
    expect(onlySponsors.rows[0].sponsorCount).toBe(1);
  });

  it("listUsersForAdmin search matches email and name", async () => {
    const u1 = await seedUser("findme");
    await seedUser("other");

    const r = await listUsersForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { search: "findme" }
    });
    expect(r.total).toBe(1);
    expect(r.rows[0].id).toBe(u1);
  });

  it("getVereinDetail returns full club info or null", async () => {
    const userA = await seedUser("d");
    const clubA = await seedClub("detail");
    const teamA = await seedTeam(clubA);
    await db.insert(clubMemberships).values({
      userId: userA,
      clubId: clubA,
      role: "admin"
    });
    await seedSubscription(clubA, { status: "active", billingCycle: "annual" });
    await seedTeamLicense(clubA, teamA, "pro");

    const [club] = await db
      .select({ slug: clubs.slug })
      .from(clubs)
      .where((await import("drizzle-orm")).eq(clubs.id, clubA))
      .limit(1);
    const detail = await getVereinDetail(club.slug);
    expect(detail).not.toBeNull();
    expect(detail?.club.id).toBe(clubA);
    expect(detail?.members.length).toBe(1);
    expect(detail?.teams.length).toBe(1);
    expect(detail?.subscription?.status).toBe("active");

    const missing = await getVereinDetail("nope-nope-nope");
    expect(missing).toBeNull();
  });

  it("getUserDetail aggregates sponsor / pledge / membership info", async () => {
    const userA = await seedUser("ud");
    const clubA = await seedClub("ud");
    const teamA = await seedTeam(clubA);
    await db.insert(clubMemberships).values({
      userId: userA,
      clubId: clubA,
      role: "viewer"
    });
    const sponsorA = await seedSponsor(userA);
    const pledgeA = await seedPledge(sponsorA, teamA);
    const ruleA = await seedPledgeRule(pledgeA, 200);
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 200 });
    await seedCharge({ pledgeId: pledgeA, pledgeRuleId: ruleA, amountCents: 300 });

    const detail = await getUserDetail(userA);
    expect(detail?.user.id).toBe(userA);
    expect(detail?.sponsors.length).toBe(1);
    expect(detail?.sponsors[0].pledgeCount).toBe(1);
    expect(detail?.sponsors[0].totalAmountCents).toBe(500);
    expect(detail?.clubMemberships.length).toBe(1);
    expect(detail?.recentPledges.length).toBe(1);

    const missing = await getUserDetail(createId());
    expect(missing).toBeNull();
  });
});
