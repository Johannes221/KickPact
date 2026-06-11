/**
 * B5 (Audit 2026-06-11 / Phase 4 Paket B): „Team/Verein verlassen".
 *
 * Self-Service-Austritt über lib/actions/team-membership.ts:
 *   - letzter (Club-/Team-)Admin darf NICHT austreten → {ok:false,message}
 *   - sonst wird die eigene Membership-Row entfernt (revoke-Queries mit
 *     Self-Scope: nur die eigene Mitgliedschaft, nie die fremder User)
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_me", email: "me@example.com" })
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  leaveClubMembershipAction,
  leaveTeamMembershipAction
} from "@/lib/actions/team-membership";

async function seedBase() {
  const db = await getTestDb();
  await db.insert(users).values([
    { id: "u_me", email: "me@example.com" },
    { id: "u_other", email: "other@example.com" }
  ]);
  await db.insert(clubs).values({ id: "c_lv", slug: "leave-fc", name: "Leave FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_lv",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "T_LV",
      fussballdeSlug: "leave-fc-1",
      isActive: true
    })
    .returning();
  return { db, teamId: team.id };
}

describe.skipIf(isIntegrationDbDisabled)("Team/Verein verlassen (B5)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("Guard: letzter Club-Admin darf den Verein nicht verlassen", async () => {
    const { db } = await seedBase();
    await db.insert(clubMemberships).values({
      clubId: "c_lv",
      userId: "u_me",
      role: "admin"
    });

    const res = await leaveClubMembershipAction({ clubId: "c_lv" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/letzte/i);

    // Membership unangetastet
    const rows = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, "c_lv"));
    expect(rows).toHaveLength(1);
  });

  it("Club-Admin mit zweitem Admin darf austreten — nur die eigene Row fliegt", async () => {
    const { db } = await seedBase();
    await db.insert(clubMemberships).values([
      { clubId: "c_lv", userId: "u_me", role: "admin" },
      { clubId: "c_lv", userId: "u_other", role: "admin" }
    ]);

    const res = await leaveClubMembershipAction({ clubId: "c_lv" });
    expect(res.ok).toBe(true);

    const rows = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, "c_lv"));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u_other");
  });

  it("Club-Viewer darf jederzeit austreten", async () => {
    const { db } = await seedBase();
    await db.insert(clubMemberships).values([
      { clubId: "c_lv", userId: "u_me", role: "viewer" },
      { clubId: "c_lv", userId: "u_other", role: "admin" }
    ]);

    const res = await leaveClubMembershipAction({ clubId: "c_lv" });
    expect(res.ok).toBe(true);
    const mine = await db
      .select()
      .from(clubMemberships)
      .where(
        and(eq(clubMemberships.clubId, "c_lv"), eq(clubMemberships.userId, "u_me"))
      );
    expect(mine).toHaveLength(0);
  });

  it("ohne Mitgliedschaft → {ok:false}", async () => {
    await seedBase();
    const res = await leaveClubMembershipAction({ clubId: "c_lv" });
    expect(res.ok).toBe(false);
  });

  it("Guard: letzter Team-Admin darf die Mannschaft nicht verlassen", async () => {
    const { db, teamId } = await seedBase();
    await db.insert(teamMemberships).values({
      teamId,
      userId: "u_me",
      role: "admin"
    });

    const res = await leaveTeamMembershipAction({ teamId });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/letzte/i);
  });

  it("Team-Mitglied (viewer) darf austreten", async () => {
    const { db, teamId } = await seedBase();
    await db.insert(teamMemberships).values([
      { teamId, userId: "u_me", role: "viewer" },
      { teamId, userId: "u_other", role: "admin" }
    ]);

    const res = await leaveTeamMembershipAction({ teamId });
    expect(res.ok).toBe(true);
    const mine = await db
      .select()
      .from(teamMemberships)
      .where(
        and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, "u_me"))
      );
    expect(mine).toHaveLength(0);
  });

  it("Team-Admin mit zweitem Admin darf austreten", async () => {
    const { db, teamId } = await seedBase();
    await db.insert(teamMemberships).values([
      { teamId, userId: "u_me", role: "admin" },
      { teamId, userId: "u_other", role: "admin" }
    ]);

    const res = await leaveTeamMembershipAction({ teamId });
    expect(res.ok).toBe(true);
  });
});
