import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships
} from "@/lib/db/schema";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { resetTestDb } from "../setup/db";

interface Fixture {
  userId: string;
  clubId: string;
  teamId: string;
  otherTeamId: string;
}

async function seed(): Promise<Fixture> {
  const userId = createId();
  const clubId = createId();
  const teamId = createId();
  const otherTeamId = createId();

  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@kickpact.local`,
    emailVerified: true,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 8)}`,
    name: "Test Club"
  });
  await db.insert(teams).values([
    { id: teamId, clubId, name: "1. Herren", saison: "2526" },
    { id: otherTeamId, clubId, name: "2. Herren", saison: "2526" }
  ]);
  return { userId, clubId, teamId, otherTeamId };
}

describe("resolveTeamAccess", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("denies when team does not exist", async () => {
    const userId = createId();
    await db.insert(users).values({
      id: userId,
      email: `t-${userId}@kickpact.local`,
      emailVerified: true,
      name: "X",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const r = await resolveTeamAccess(userId, "nonexistent", "viewer");
    expect(r.granted).toBe(false);
  });

  it("denies when user has no membership at all", async () => {
    const { userId, teamId } = await seed();
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("grants club-admin access at scope=club", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });

  it("grants club-trainer access when only viewer is required", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("trainer");
  });

  it("denies club-viewer when trainer is required", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "trainer");
    expect(r.granted).toBe(false);
  });

  it("grants team-trainer access at scope=team", async () => {
    const { userId, teamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "trainer" });
    const r = await resolveTeamAccess(userId, teamId, "trainer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("team");
    expect(r.role).toBe("trainer");
  });

  it("denies team-viewer when trainer is required", async () => {
    const { userId, teamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "trainer");
    expect(r.granted).toBe(false);
  });

  it("does not grant access to a different team within the same club via team-membership", async () => {
    const { userId, teamId, otherTeamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "trainer" });
    const r = await resolveTeamAccess(userId, otherTeamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("prefers club-scope over team-scope when both exist", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });
});
