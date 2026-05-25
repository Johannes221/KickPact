import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  sponsors,
  pledges,
  pledgeRules,
  charges,
  subscriptions,
  teamLicenses
} from "@/lib/db/schema";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { resetTestDb } from "../setup/db";

async function makeUser(suffix: string): Promise<string> {
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

async function makeClubWithTeam(slugHint: string) {
  const clubId = createId();
  const teamId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `${slugHint}-${clubId.slice(0, 6)}`,
    name: `Club ${slugHint}`,
    logoUrl: null
  });
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "1. Herren",
    saison: "2526"
  });
  return { clubId, teamId };
}

describe("getUserIdentities", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns empty for a user with no memberships", async () => {
    const userId = await makeUser("empty");
    const r = await getUserIdentities(userId);
    expect(r.clubs).toEqual([]);
    expect(r.teamOnly).toEqual([]);
    expect(r.sponsor).toBeNull();
  });

  it("returns one club identity for a club-admin", async () => {
    const userId = await makeUser("admin");
    const { clubId } = await makeClubWithTeam("a");
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.clubs[0].clubId).toBe(clubId);
    expect(r.clubs[0].role).toBe("admin");
    expect(r.clubs[0].teamCount).toBe(1);
    expect(r.teamOnly).toEqual([]);
  });

  it("returns a team-only identity when user has only a team membership", async () => {
    const userId = await makeUser("teamonly");
    const { teamId, clubId } = await makeClubWithTeam("b");
    await db.insert(teamMemberships).values({ userId, teamId, role: "trainer" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toEqual([]);
    expect(r.teamOnly).toHaveLength(1);
    expect(r.teamOnly[0].teamId).toBe(teamId);
    expect(r.teamOnly[0].role).toBe("trainer");
    expect(r.teamOnly[0].saison).toBe("2526");
    expect(r.sponsor).toBeNull();
    void clubId;
  });

  it("hides team identity when user already has club membership in the same club", async () => {
    const userId = await makeUser("dual");
    const { clubId, teamId } = await makeClubWithTeam("c");
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.teamOnly).toEqual([]);
  });

  it("returns a sponsor identity when sponsors row exists", async () => {
    const userId = await makeUser("sponsor");
    await db.insert(sponsors).values({
      id: createId(),
      userId,
      displayName: "Tante Erna",
      type: "familie"
    });

    const r = await getUserIdentities(userId);
    expect(r.sponsor).not.toBeNull();
    expect(r.sponsor?.displayName).toBe("Tante Erna");
    expect(r.sponsor?.activePledgeCount).toBe(0);
    expect(r.sponsor?.thisMonthCents).toBe(0);
  });

  it("returns all three identity types for a multi-role user", async () => {
    const userId = await makeUser("multi");
    const { clubId } = await makeClubWithTeam("d");
    const { teamId: otherTeamId } = await makeClubWithTeam("e");
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(teamMemberships).values({ userId, teamId: otherTeamId, role: "trainer" });
    await db.insert(sponsors).values({
      id: createId(),
      userId,
      displayName: "Bäckerei Müller",
      type: "business"
    });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.teamOnly).toHaveLength(1);
    expect(r.sponsor).not.toBeNull();
    void pledges;
  });

  it("computes sponsor stats with active pledges and current-month charges", async () => {
    const userId = await makeUser("stats");
    const { teamId } = await makeClubWithTeam("stats");

    const sponsorId = createId();
    await db.insert(sponsors).values({
      id: sponsorId,
      userId,
      displayName: "Statistik-Sponsor",
      type: "familie"
    });

    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);

    const activePledgeId = createId();
    await db.insert(pledges).values({
      id: activePledgeId,
      sponsorId,
      teamId,
      status: "active",
      startsAt: new Date(),
      endsAt: oneYear,
      monthlyCapCents: null
    });
    const endedPledgeId = createId();
    await db.insert(pledges).values({
      id: endedPledgeId,
      sponsorId,
      teamId,
      status: "ended",
      startsAt: new Date(),
      endsAt: oneYear,
      monthlyCapCents: null
    });

    // pledge_rule for the active pledge (charges.pledgeRuleId is NOT NULL)
    const pledgeRuleId = createId();
    await db.insert(pledgeRules).values({
      id: pledgeRuleId,
      pledgeId: activePledgeId,
      triggerType: "goal_total",
      amountCents: 750
    });

    // Charge inside current month (createdAt defaults to now())
    await db.insert(charges).values({
      id: createId(),
      pledgeId: activePledgeId,
      pledgeRuleId,
      matchId: null,
      matchEventId: null,
      triggerType: "goal_total",
      amountCents: 750,
      status: "confirmed"
    });

    const r = await getUserIdentities(userId);
    expect(r.sponsor?.activePledgeCount).toBe(1);
    expect(r.sponsor?.thisMonthCents).toBe(750);
  });

  it("club without team_licenses has effectivePlan=null, firstTeamId set", async () => {
    const userId = await makeUser("noplan");
    const { clubId, teamId } = await makeClubWithTeam("noplan");
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.clubs[0].effectivePlan).toBeNull();
    expect(r.clubs[0].firstTeamId).toBe(teamId);
  });

  it("club with one basic team_license → effectivePlan=basic", async () => {
    const userId = await makeUser("basic");
    const { clubId, teamId } = await makeClubWithTeam("basic");
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(subscriptions).values({ clubId, status: "active" });
    await db.insert(teamLicenses).values({
      id: createId(),
      subscriptionClubId: clubId,
      teamId,
      plan: "basic",
      status: "active"
    });

    const r = await getUserIdentities(userId);
    expect(r.clubs[0].effectivePlan).toBe("basic");
    expect(r.clubs[0].firstTeamId).toBe(teamId);
  });

  it("club with verein license on any team → effectivePlan=verein", async () => {
    const userId = await makeUser("verein");
    const { clubId, teamId } = await makeClubWithTeam("verein");
    // add a second team
    const teamId2 = createId();
    await db.insert(teams).values({ id: teamId2, clubId, name: "2. Herren", saison: "2526" });
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(subscriptions).values({ clubId, status: "active" });
    // First team has basic, second has verein → highest wins
    await db.insert(teamLicenses).values([
      {
        id: createId(),
        subscriptionClubId: clubId,
        teamId,
        plan: "basic",
        status: "active"
      },
      {
        id: createId(),
        subscriptionClubId: clubId,
        teamId: teamId2,
        plan: "verein",
        status: "active"
      }
    ]);

    const r = await getUserIdentities(userId);
    expect(r.clubs[0].effectivePlan).toBe("verein");
  });

  it("club with multiple teams returns oldest as firstTeamId", async () => {
    const userId = await makeUser("first");
    const clubId = createId();
    const olderTeamId = createId();
    const newerTeamId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `first-${clubId.slice(0, 6)}`,
      name: "First Club"
    });
    const older = new Date("2025-01-01T00:00:00Z");
    const newer = new Date("2025-06-01T00:00:00Z");
    await db.insert(teams).values([
      { id: olderTeamId, clubId, name: "1. Herren", saison: "2526", createdAt: older },
      { id: newerTeamId, clubId, name: "2. Herren", saison: "2526", createdAt: newer }
    ]);
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });

    const r = await getUserIdentities(userId);
    expect(r.clubs[0].firstTeamId).toBe(olderTeamId);
    expect(r.clubs[0].teamCount).toBe(2);
  });
});
