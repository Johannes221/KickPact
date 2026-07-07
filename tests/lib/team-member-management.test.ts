import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
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
  canManageTeamMembers,
  isTeamAutark
} from "@/lib/auth/scope";
import { countTeamAdmins } from "@/lib/db/queries/membership-requests";
import { resetTestDb } from "../setup/db";

async function seedUser(): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `u-${id}@kickpact.local`,
    emailVerified: true,
    name: "U",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return id;
}

async function seedClubTeam() {
  const clubId = createId();
  const teamId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 8)}`,
    name: "Club"
  });
  await db.insert(teams).values({ id: teamId, clubId, name: "1. Herren", saison: "2526" });
  return { clubId, teamId };
}

async function setLicense(
  clubId: string,
  teamId: string,
  plan: "basic" | "pro" | "verein",
  parentClubLicenseId: string | null = null
) {
  await db.insert(subscriptions).values({ clubId }).onConflictDoNothing();
  await db.insert(teamLicenses).values({
    subscriptionClubId: clubId,
    teamId,
    plan,
    status: "active",
    parentClubLicenseId
  });
}

async function seedClub(): Promise<string> {
  const clubId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `b-${clubId.slice(0, 8)}`,
    name: "Verein B"
  });
  return clubId;
}

async function setLicensedUnder(teamId: string, clubId: string | null) {
  await db.update(teams).set({ licensedUnderClubId: clubId }).where(eq(teams.id, teamId));
}

describe("isTeamAutark", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("NOT autark when no license (plain container team → club durchgriff allowed)", async () => {
    // Regressions-Guard: ein lizenzloses Team darf NICHT autark sein, sonst
    // wird der Club-Admin in genau dieses Team geroutet und vom Page-Guard
    // zurück auf /dashboard geworfen → Endlos-Redirect (/dashboard ⇄ Team).
    const { teamId } = await seedClubTeam();
    expect(await isTeamAutark(teamId)).toBe(false);
  });

  it("autark for own pro license without parent", async () => {
    const { clubId, teamId } = await seedClubTeam();
    await setLicense(clubId, teamId, "pro");
    expect(await isTeamAutark(teamId)).toBe(true);
  });

  it("autark for own basic license without parent", async () => {
    const { clubId, teamId } = await seedClubTeam();
    await setLicense(clubId, teamId, "basic");
    expect(await isTeamAutark(teamId)).toBe(true);
  });

  it("NOT autark for plan=verein", async () => {
    const { clubId, teamId } = await seedClubTeam();
    await setLicense(clubId, teamId, "verein");
    expect(await isTeamAutark(teamId)).toBe(false);
  });

  it("NOT autark when bundled under a parent club license", async () => {
    const { clubId, teamId } = await seedClubTeam();
    // Parent-Lizenz auf eigenem Team, dann Kind-Team daran hängen.
    const parentTeamId = createId();
    await db.insert(teams).values({ id: parentTeamId, clubId, name: "Parent", saison: "2526" });
    await db.insert(subscriptions).values({ clubId }).onConflictDoNothing();
    const [parent] = await db
      .insert(teamLicenses)
      .values({ subscriptionClubId: clubId, teamId: parentTeamId, plan: "verein", status: "active" })
      .returning({ id: teamLicenses.id });
    await db.insert(teamLicenses).values({
      subscriptionClubId: clubId,
      teamId,
      plan: "basic",
      status: "active",
      parentClubLicenseId: parent.id
    });
    expect(await isTeamAutark(teamId)).toBe(false);
  });
});

describe("countTeamAdmins", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("counts only admins", async () => {
    const { teamId } = await seedClubTeam();
    const a = await seedUser();
    const b = await seedUser();
    const v = await seedUser();
    await db.insert(teamMemberships).values([
      { userId: a, teamId, role: "admin" },
      { userId: b, teamId, role: "admin" },
      { userId: v, teamId, role: "viewer" }
    ]);
    expect(await countTeamAdmins(teamId)).toBe(2);
  });

  it("returns 0 for a team without admins", async () => {
    const { teamId } = await seedClubTeam();
    expect(await countTeamAdmins(teamId)).toBe(0);
  });
});

describe("canManageTeamMembers", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("true for a direct team-admin", async () => {
    const { teamId } = await seedClubTeam();
    const u = await seedUser();
    await db.insert(teamMemberships).values({ userId: u, teamId, role: "admin" });
    expect(await canManageTeamMembers(u, teamId)).toBe(true);
  });

  it("false for a team-viewer", async () => {
    const { teamId } = await seedClubTeam();
    const u = await seedUser();
    await db.insert(teamMemberships).values({ userId: u, teamId, role: "viewer" });
    expect(await canManageTeamMembers(u, teamId)).toBe(false);
  });

  it("true for a club-admin of a vereinsgeführt team", async () => {
    const { clubId, teamId } = await seedClubTeam();
    const u = await seedUser();
    await db.insert(clubMemberships).values({ userId: u, clubId, role: "admin" });
    await setLicense(clubId, teamId, "verein");
    expect(await canManageTeamMembers(u, teamId)).toBe(true);
  });

  it("false for a club-admin of an autark team (own pro license)", async () => {
    const { clubId, teamId } = await seedClubTeam();
    const u = await seedUser();
    await db.insert(clubMemberships).values({ userId: u, clubId, role: "admin" });
    await setLicense(clubId, teamId, "pro");
    expect(await canManageTeamMembers(u, teamId)).toBe(false);
  });

  it("true for a club-admin of a licenseless container team", async () => {
    const { clubId, teamId } = await seedClubTeam();
    const u = await seedUser();
    await db.insert(clubMemberships).values({ userId: u, clubId, role: "admin" });
    // Keine Lizenz-Zeile → nicht autark → Club-Admin darf verwalten.
    expect(await canManageTeamMembers(u, teamId)).toBe(true);
  });

  it("false for a club-trainer even on a vereinsgeführt team", async () => {
    const { clubId, teamId } = await seedClubTeam();
    const u = await seedUser();
    await db.insert(clubMemberships).values({ userId: u, clubId, role: "trainer" });
    await setLicense(clubId, teamId, "verein");
    expect(await canManageTeamMembers(u, teamId)).toBe(false);
  });

  it("false for a stranger", async () => {
    const { teamId } = await seedClubTeam();
    const u = await seedUser();
    expect(await canManageTeamMembers(u, teamId)).toBe(false);
  });

  // A5: nach Lizenz-Transfer verwaltet der zahlende Verein B, nicht mehr der
  // Alt-Container A (Durchgriff folgt licensedUnderClubId ?? clubId).
  it("true for the LICENSING club's admin after a transfer", async () => {
    const { teamId } = await seedClubTeam();
    const clubB = await seedClub();
    const adminB = await seedUser();
    await db.insert(clubMemberships).values({ userId: adminB, clubId: clubB, role: "admin" });
    await setLicensedUnder(teamId, clubB);
    await setLicense(clubB, teamId, "verein");
    expect(await canManageTeamMembers(adminB, teamId)).toBe(true);
  });

  it("false for the OLD container admin after a transfer", async () => {
    const { clubId: containerId, teamId } = await seedClubTeam();
    const containerAdmin = await seedUser();
    await db.insert(clubMemberships).values({ userId: containerAdmin, clubId: containerId, role: "admin" });
    const clubB = await seedClub();
    await setLicensedUnder(teamId, clubB);
    await setLicense(clubB, teamId, "verein");
    expect(await canManageTeamMembers(containerAdmin, teamId)).toBe(false);
  });

  it("false when the team does not exist", async () => {
    const u = await seedUser();
    expect(await canManageTeamMembers(u, "nonexistent")).toBe(false);
  });
});
