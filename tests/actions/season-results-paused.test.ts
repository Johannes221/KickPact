/**
 * Phase 3 / R8 — setSeasonResult muss in der Saison-Pass-Sommerpause
 * (Subscription-Status "paused") erlaubt sein: die Saison endet am 30.6.,
 * genau dann trägt der Verein den Endstand ein. Andere Read-Only-Gründe
 * (cancelled) bleiben geblockt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

const { requireUserMock, inngestSendMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  inngestSendMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: inngestSendMock }
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  subscriptions,
  seasonResults
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { setSeasonResult } from "@/lib/actions/season-results";

async function seed(subscriptionStatus: "paused" | "cancelled") {
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.local`,
    emailVerified: true,
    name: "Admin",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${userId.slice(0, 6)}`,
      name: "Pausen Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id, slug: clubs.slug });
  await db.insert(clubMemberships).values({
    clubId: club.id,
    userId,
    role: "admin"
  });
  await db.insert(subscriptions).values({
    clubId: club.id,
    stripeCustomerId: `cus_${userId.slice(0, 6)}`,
    stripeSubscriptionId: `sub_${userId.slice(0, 6)}`,
    status: subscriptionStatus
  });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: `T_${userId.slice(0, 6)}`,
      isActive: true
    })
    .returning({ id: teams.id });

  requireUserMock.mockResolvedValue({ id: userId, email: `${userId}@test.local` });
  return { teamId: team.id, clubId: club.id };
}

describe("setSeasonResult in der Sommerpause", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    inngestSendMock.mockResolvedValue(undefined);
  });

  it("paused (Saison-Pass-Sommerpause) → Eintrag erlaubt", async () => {
    const { teamId } = await seed("paused");

    await setSeasonResult({
      teamId,
      saison: "2526",
      finalPosition: 3,
      teamsInLeague: 14,
      promoted: false,
      relegated: false
    });

    const rows = await db
      .select()
      .from(seasonResults)
      .where(eq(seasonResults.teamId, teamId));
    expect(rows).toHaveLength(1);
    expect(rows[0].finalPosition).toBe(3);
    expect(inngestSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "season/result-set" })
    );
  });

  it("cancelled → bleibt geblockt", async () => {
    const { teamId } = await seed("cancelled");

    await expect(
      setSeasonResult({
        teamId,
        saison: "2526",
        finalPosition: 3,
        teamsInLeague: 14,
        promoted: false,
        relegated: false
      })
    ).rejects.toThrow(/Read-Only/i);

    expect(
      await db.select().from(seasonResults).where(eq(seasonResults.teamId, teamId))
    ).toHaveLength(0);
  });
});
