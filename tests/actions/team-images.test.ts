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
vi.mock("@/lib/storage/documents", () => ({
  storeDocument: vi.fn().mockImplementation(async (key: string) => `local://${key.replace(/\//g, "_")}`)
}));

import { db } from "@/lib/db/client";
import { clubs, clubMemberships, subscriptions, teams, teamLicenses, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import { uploadTeamCover, addTeamGalleryImage } from "@/lib/actions/team-images";
import { listTeamImages } from "@/lib/db/queries/team-images";

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
  return { teamId: team.id };
}

describe("team-images actions", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("uploadTeamCover setzt cover_url", async () => {
    const { teamId } = await makeClubWithAdmin("club-cover");
    const res = await uploadTeamCover({ teamId, filename: "c.png", contentType: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) });
    expect(res.coverUrl).toMatch(/^local:\/\//);
    const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(t.coverUrl).toBe(res.coverUrl);
  });

  it("addTeamGalleryImage fügt hinzu, lehnt >8 ab", async () => {
    const { teamId } = await makeClubWithAdmin("club-gal");
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    for (let i = 0; i < 8; i++) {
      await addTeamGalleryImage({ teamId, filename: `g${i}.png`, contentType: "image/png", bytes: pngBytes });
    }
    expect((await listTeamImages(teamId)).length).toBe(8);
    await expect(
      addTeamGalleryImage({ teamId, filename: "g9.png", contentType: "image/png", bytes: pngBytes })
    ).rejects.toThrow(/max|8/i);
  });
});
