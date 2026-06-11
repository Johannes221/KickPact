/**
 * B9 (Audit 2026-06-11 / Phase 4 Paket B): Team-scoped Sponsor-Invite-Gate.
 *
 * `ensureSponsorInviteLink` prüfte verifiedAt NICHT serverseitig (das
 * Club-Pendant createInvitationAction tut es) — nur die UI blendete den
 * Invite-Block aus. Jetzt: unverifiziert → {ok:false,message}.
 * Verifikations-Scope analog Sponsoren-Page: Vereinslizenz → clubs.verifiedAt,
 * Einzel-Mannschaft (basic/pro) → teams.verifiedAt.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserOrThrow: vi
    .fn()
    .mockResolvedValue({ id: "u_gate", email: "gate@example.com" })
}));
vi.mock("@/lib/auth/scope", () => ({
  resolveTeamAccess: vi.fn().mockResolvedValue({ granted: true, role: "admin" })
}));

import { users, clubs, teams } from "@/lib/db/schema";
import { subscriptions, teamLicenses } from "@/lib/db/schema/billing";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { ensureSponsorInviteLink } from "@/app/(verein)/verein/[slug]/mannschaft/[teamId]/sponsoren/_actions/invite";

async function seed(opts: {
  plan: "basic" | "pro" | "verein";
  teamVerified?: boolean;
  clubVerified?: boolean;
}) {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_gate", email: "gate@example.com" });
  await db.insert(clubs).values({
    id: "c_gate",
    slug: "gate-fc",
    name: "Gate FC",
    verifiedAt: opts.clubVerified ? new Date() : null
  });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_gate",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "T_GATE",
      fussballdeSlug: "gate-fc-1",
      isActive: true,
      verifiedAt: opts.teamVerified ? new Date() : null
    })
    .returning();
  await db.insert(subscriptions).values({ clubId: "c_gate", status: "active" });
  await db.insert(teamLicenses).values({
    subscriptionClubId: "c_gate",
    teamId: team.id,
    plan: opts.plan,
    status: "active"
  });
  return team.id;
}

describe.skipIf(isIntegrationDbDisabled)("ensureSponsorInviteLink Gate (B9)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("Solo-Team (pro) unverifiziert → {ok:false} mit Hinweis", async () => {
    const teamId = await seed({ plan: "pro" });

    const res = await ensureSponsorInviteLink(teamId);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/verifizier/i);
  });

  it("Solo-Team (pro) mit team.verifiedAt → Token wird erzeugt", async () => {
    const teamId = await seed({ plan: "pro", teamVerified: true });

    const res = await ensureSponsorInviteLink(teamId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.token).toBeTruthy();
  });

  it("Vereinslizenz: clubs.verifiedAt zählt (Team selbst unverifiziert)", async () => {
    const teamId = await seed({ plan: "verein", clubVerified: true });

    const res = await ensureSponsorInviteLink(teamId);
    expect(res.ok).toBe(true);
  });

  it("Vereinslizenz unverifiziert → {ok:false}", async () => {
    const teamId = await seed({ plan: "verein" });

    const res = await ensureSponsorInviteLink(teamId);
    expect(res.ok).toBe(false);
  });
});
