/**
 * `assertTeamWriteAccess` — Schreibguard für team-scoped Server-Actions.
 *
 * Deckt die MEDIUM-Lücke ab, wegen der die Schreib-Actions (Match-Events,
 * deactivate/reactivate, setTeamDiscoverable) vorher am reinen Club-Guard
 * hingen: ein Club-Admin konnte in ein AUTARKES Team durchschreiben, obwohl
 * die Lese-/Verwaltungs-Guards ihn dort sperren. Zusätzlich: Read-Only-Gate
 * läuft team-scoped (getSubscriptionGateForTeam), inkl. paused-Ausnahme.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import type { SubscriptionStatus } from "@/lib/db/queries/subscription-status";

const mockUser = { id: "u_write_guard", email: "wg@kickpact.local" };
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => mockUser)
}));

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
import { assertTeamWriteAccess } from "@/lib/auth/scope";
import { resetTestDb } from "../setup/db";

async function seed(opts: {
  plan: "basic" | "pro" | "verein";
  subStatus?: SubscriptionStatus;
  clubRole?: "admin" | "trainer" | "viewer";
  teamRole?: "admin" | "viewer";
}): Promise<{ clubId: string; teamId: string }> {
  const clubId = createId();
  const teamId = createId();
  await db
    .insert(users)
    .values({
      id: mockUser.id,
      email: mockUser.email,
      emailVerified: true,
      name: "WG",
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .onConflictDoNothing();
  await db
    .insert(clubs)
    .values({ id: clubId, slug: `c-${clubId.slice(0, 8)}`, name: "WG Club" });
  await db
    .insert(teams)
    .values({ id: teamId, clubId, name: "1. Herren", saison: "2526" });
  await db
    .insert(subscriptions)
    .values({ clubId, status: opts.subStatus ?? "active" });
  await db.insert(teamLicenses).values({
    subscriptionClubId: clubId,
    teamId,
    plan: opts.plan,
    status: "active",
    // basic/pro ohne Parent → autark; verein → vereinsgeführt.
    parentClubLicenseId: null
  });
  if (opts.clubRole) {
    await db
      .insert(clubMemberships)
      .values({ userId: mockUser.id, clubId, role: opts.clubRole });
  }
  if (opts.teamRole) {
    await db
      .insert(teamMemberships)
      .values({ userId: mockUser.id, teamId, role: opts.teamRole });
  }
  return { clubId, teamId };
}

describe("assertTeamWriteAccess", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("BLOCKS club-admin durchgriff on an AUTARK team (core hole)", async () => {
    const { teamId } = await seed({ plan: "pro", clubRole: "admin" });
    // Kein team_membership → autark blockt Durchgriff → redirect(/dashboard).
    await expect(assertTeamWriteAccess(teamId)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("grants the autark team-admin via direct team-membership (scope=team)", async () => {
    const { teamId } = await seed({
      plan: "pro",
      clubRole: "admin",
      teamRole: "admin"
    });
    const res = await assertTeamWriteAccess(teamId);
    expect(res.access.granted).toBe(true);
    expect(res.access.scope).toBe("team");
  });

  it("grants club-admin durchgriff on a vereinsgeführt team (scope=club)", async () => {
    const { teamId } = await seed({ plan: "verein", clubRole: "admin" });
    const res = await assertTeamWriteAccess(teamId);
    expect(res.access.granted).toBe(true);
    expect(res.access.scope).toBe("club");
  });

  it("throws Read-Only when the effective subscription is cancelled", async () => {
    const { teamId } = await seed({
      plan: "verein",
      clubRole: "admin",
      subStatus: "cancelled"
    });
    await expect(assertTeamWriteAccess(teamId)).rejects.toThrow(/Read-Only/);
  });

  it("blocks paused by default but allows it with allowPaused", async () => {
    const { teamId } = await seed({
      plan: "verein",
      clubRole: "admin",
      subStatus: "paused"
    });
    await expect(assertTeamWriteAccess(teamId)).rejects.toThrow(/Read-Only/);
    const res = await assertTeamWriteAccess(teamId, { allowPaused: true });
    expect(res.access.granted).toBe(true);
  });

  it("clubMinRole=trainer lets a club-trainer through (match-event floor)", async () => {
    const { teamId } = await seed({ plan: "verein", clubRole: "trainer" });
    // Default-Floor = admin → Trainer würde geblockt.
    await expect(assertTeamWriteAccess(teamId)).rejects.toThrow(/NEXT_REDIRECT/);
    // Mit clubMinRole=trainer greift der Durchgriff.
    const res = await assertTeamWriteAccess(teamId, { clubMinRole: "trainer" });
    expect(res.access.granted).toBe(true);
    expect(res.access.scope).toBe("club");
  });
});
