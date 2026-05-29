import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  subscriptions,
  teamLicenses
} from "@/lib/db/schema";
import {
  findLicensedVereinByFussballdeId,
  checkTeamCollision
} from "@/lib/db/queries/onboarding-collision";
import { resetTestDb } from "../setup/db";

type Plan = "basic" | "pro" | "verein";

async function seedUser(): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `u-${id}@kickpact.local`,
    emailVerified: true,
    name: "User",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return id;
}

async function seedClub(opts: {
  vereinId: string | null;
  completed?: boolean;
}): Promise<string> {
  const clubId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `club-${clubId.slice(0, 8)}`,
    name: "SV Test",
    fussballdeVereinId: opts.vereinId,
    onboardingStatus: opts.completed === false ? "draft" : "completed"
  });
  return clubId;
}

async function seedTeam(opts: {
  clubId: string;
  fussballdeTeamId: string | null;
  saison?: string;
}): Promise<string> {
  const teamId = createId();
  await db.insert(teams).values({
    id: teamId,
    clubId: opts.clubId,
    name: "1. Herren",
    saison: opts.saison ?? "2526",
    fussballdeTeamId: opts.fussballdeTeamId
  });
  return teamId;
}

async function seedLicense(clubId: string, teamId: string, plan: Plan) {
  await db.insert(subscriptions).values({ clubId, status: "trialing" });
  await db.insert(teamLicenses).values({
    subscriptionClubId: clubId,
    teamId,
    plan,
    status: "trialing"
  });
}

describe("onboarding-collision queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("findLicensedVereinByFussballdeId", () => {
    it("hits a club that has a verein license", async () => {
      const clubId = await seedClub({ vereinId: "V-100" });
      const teamId = await seedTeam({ clubId, fussballdeTeamId: "T-1" });
      await seedLicense(clubId, teamId, "verein");

      const match = await findLicensedVereinByFussballdeId("V-100");
      expect(match?.clubId).toBe(clubId);
    });

    it("returns null when only a pro license exists", async () => {
      const clubId = await seedClub({ vereinId: "V-200" });
      const teamId = await seedTeam({ clubId, fussballdeTeamId: "T-2" });
      await seedLicense(clubId, teamId, "pro");

      expect(await findLicensedVereinByFussballdeId("V-200")).toBeNull();
    });

    it("returns null for an unknown verein", async () => {
      expect(await findLicensedVereinByFussballdeId("V-NOPE")).toBeNull();
    });

    it("two containers share a verein id — returns the licensed one (proves unique dropped)", async () => {
      // Solo-Mannschaft (pro) und echter Verein (verein) teilen sich V-300.
      const soloClub = await seedClub({ vereinId: "V-300" });
      const soloTeam = await seedTeam({ clubId: soloClub, fussballdeTeamId: "T-3a" });
      await seedLicense(soloClub, soloTeam, "pro");

      const vereinClub = await seedClub({ vereinId: "V-300" });
      const vereinTeam = await seedTeam({ clubId: vereinClub, fussballdeTeamId: "T-3b" });
      await seedLicense(vereinClub, vereinTeam, "verein");

      const match = await findLicensedVereinByFussballdeId("V-300");
      expect(match?.clubId).toBe(vereinClub);
    });
  });

  describe("checkTeamCollision", () => {
    it("none when no team has that fussballde id", async () => {
      expect(await checkTeamCollision("T-MISSING", "2526")).toEqual({ kind: "none" });
    });

    it("scraped-unmanaged when the team has zero memberships", async () => {
      const clubId = await seedClub({ vereinId: "V-400" });
      const teamId = await seedTeam({ clubId, fussballdeTeamId: "T-4" });

      const result = await checkTeamCollision("T-4", "2526");
      expect(result).toMatchObject({ kind: "scraped-unmanaged", teamId, clubId });
    });

    it("actively-managed when the club has an admin membership", async () => {
      const clubId = await seedClub({ vereinId: "V-500" });
      const teamId = await seedTeam({ clubId, fussballdeTeamId: "T-5" });
      const userId = await seedUser();
      await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });

      const result = await checkTeamCollision("T-5", "2526");
      expect(result).toMatchObject({ kind: "actively-managed", teamId, clubId });
    });

    it("scraped-unmanaged when the only club membership is a viewer", async () => {
      const clubId = await seedClub({ vereinId: "V-600" });
      const teamId = await seedTeam({ clubId, fussballdeTeamId: "T-6" });
      const userId = await seedUser();
      await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });

      const result = await checkTeamCollision("T-6", "2526");
      expect(result).toMatchObject({ kind: "scraped-unmanaged", teamId });
    });

    it("actively-managed when a team-membership admin exists (no club membership)", async () => {
      const clubId = await seedClub({ vereinId: "V-700" });
      const teamId = await seedTeam({ clubId, fussballdeTeamId: "T-7" });
      const userId = await seedUser();
      await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });

      const result = await checkTeamCollision("T-7", "2526");
      expect(result).toMatchObject({ kind: "actively-managed", teamId, clubId });
    });
  });
});
