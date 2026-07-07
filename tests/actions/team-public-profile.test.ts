import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

const { mockUserId } = vi.hoisted(() => ({ mockUserId: { current: "" } }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@kickpact.local`
  }))
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: "stub" }) } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));

import { db } from "@/lib/db/client";
import { clubs, clubMemberships, subscriptions, teams, teamLicenses, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import { saveTeamPublicProfile } from "@/lib/actions/team-public-profile";

async function makeClubWithAdmin(slug: string) {
  const userId = createId();
  await db.insert(users).values({
    id: userId, email: `${userId}@kickpact.local`, emailVerified: true, name: "T",
    createdAt: new Date(), updatedAt: new Date()
  });
  mockUserId.current = userId;
  const [club] = await db.insert(clubs)
    .values({ slug, name: `Club ${slug}`, fussballdeVereinId: `V_${slug}`, onboardingStatus: "completed" })
    .returning({ id: clubs.id });
  await db.insert(clubMemberships).values({ userId, clubId: club.id, role: "admin" });
  await db.insert(subscriptions).values({ clubId: club.id, status: "trialing", billingCycle: "monthly" });
  const [team] = await db.insert(teams)
    .values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: `T_${slug}`, isActive: true })
    .returning({ id: teams.id });
  await db.insert(teamLicenses).values({ subscriptionClubId: club.id, teamId: team.id, plan: "pro", status: "trialing" });
  return { teamId: team.id, clubId: club.id };
}

describe("saveTeamPublicProfile", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("speichert das öffentliche Profil und vergibt einen Slug", async () => {
    const { teamId } = await makeClubWithAdmin("club-pp-ok");
    const res = await saveTeamPublicProfile({ teamId, isPublic: true, publicTagline: "Wir suchen Sponsoren" });
    expect(res.slug).toBeTruthy();
    const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(t.discoverable).toBe(true);
    expect(t.publicTagline).toBe("Wir suchen Sponsoren");
  });

  it("wirft im Read-Only-Modus (Abo gekündigt) und ändert nichts", async () => {
    const { teamId, clubId } = await makeClubWithAdmin("club-pp-ro");
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.clubId, clubId));
    await expect(
      saveTeamPublicProfile({ teamId, isPublic: true, publicTagline: "x" })
    ).rejects.toThrow(/Read-Only/);
    const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(t.discoverable).toBe(false);
    expect(t.publicSlug).toBeNull();
  });
});
