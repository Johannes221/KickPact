import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, teams, clubMemberships } from "@/lib/db/schema";
import {
  getActiveDraftForUser,
  nextOnboardingStep,
  type OnboardingDraft
} from "@/lib/db/queries/onboarding-draft";
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

async function makeDraftClub(opts: {
  userId: string;
  status?: "draft" | "stammdaten_complete";
  role?: "mannschaft" | "verein";
  hasStammdaten?: boolean;
  startedAt?: Date;
}) {
  const clubId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `draft-${clubId.slice(0, 6)}`,
    name: "Draft Verein",
    onboardingStatus: opts.status ?? "draft",
    onboardingRole: opts.role ?? "mannschaft",
    onboardingStartedAt: opts.startedAt ?? new Date(),
    addressJson: opts.hasStammdaten
      ? { street: "Hauptstr 1", zip: "12345", city: "Berlin", country: "DE" }
      : null
  });
  await db.insert(clubMemberships).values({
    userId: opts.userId,
    clubId,
    role: "admin"
  });
  return clubId;
}

describe("getActiveDraftForUser", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns null when user has no clubs", async () => {
    const userId = await makeUser("none");
    expect(await getActiveDraftForUser(userId)).toBeNull();
  });

  it("returns null when user only has completed clubs", async () => {
    const userId = await makeUser("done");
    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `done-${clubId.slice(0, 6)}`,
      name: "Completed Club"
      // onboardingStatus defaults to 'completed'
    });
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });

    expect(await getActiveDraftForUser(userId)).toBeNull();
  });

  it("returns the draft when one exists", async () => {
    const userId = await makeUser("draft");
    const clubId = await makeDraftClub({ userId, status: "draft", role: "mannschaft" });

    const draft = await getActiveDraftForUser(userId);
    expect(draft).not.toBeNull();
    expect(draft!.clubId).toBe(clubId);
    expect(draft!.onboardingStatus).toBe("draft");
    expect(draft!.onboardingRole).toBe("mannschaft");
    expect(draft!.hasStammdaten).toBe(false);
    expect(draft!.teamCount).toBe(0);
  });

  it("returns the oldest draft when user has multiple", async () => {
    const userId = await makeUser("multi");
    const older = new Date(Date.now() - 60_000);
    const oldClub = await makeDraftClub({ userId, startedAt: older });
    await makeDraftClub({ userId, startedAt: new Date() });

    const draft = await getActiveDraftForUser(userId);
    expect(draft!.clubId).toBe(oldClub);
  });

  it("ignores drafts where user is only viewer (not admin)", async () => {
    const userId = await makeUser("viewer");
    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `v-${clubId.slice(0, 6)}`,
      name: "Other Draft",
      onboardingStatus: "draft",
      onboardingRole: "verein"
    });
    await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });

    expect(await getActiveDraftForUser(userId)).toBeNull();
  });

  it("reflects hasStammdaten correctly", async () => {
    const userId = await makeUser("stamm");
    await makeDraftClub({
      userId,
      status: "stammdaten_complete",
      hasStammdaten: true
    });

    const draft = await getActiveDraftForUser(userId);
    expect(draft!.hasStammdaten).toBe(true);
    expect(draft!.onboardingStatus).toBe("stammdaten_complete");
  });

  it("counts teams under the draft club", async () => {
    const userId = await makeUser("teams");
    const clubId = await makeDraftClub({ userId, role: "verein" });
    await db.insert(teams).values([
      { id: createId(), clubId, name: "1. Herren", saison: "2526" },
      { id: createId(), clubId, name: "2. Herren", saison: "2526" },
      { id: createId(), clubId, name: "A-Jugend", saison: "2526" }
    ]);

    const draft = await getActiveDraftForUser(userId);
    expect(draft!.teamCount).toBe(3);
  });
});

describe("getUserIdentities filters drafts", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("does not list draft clubs as identities", async () => {
    const userId = await makeUser("hidden");
    await makeDraftClub({ userId, status: "draft" });

    const ids = await getUserIdentities(userId);
    expect(ids.clubs).toEqual([]);
  });

  it("lists completed clubs but skips drafts in the same user's set", async () => {
    const userId = await makeUser("mixed");
    // Completed club
    const completedId = createId();
    await db.insert(clubs).values({
      id: completedId,
      slug: `c-${completedId.slice(0, 6)}`,
      name: "Completed"
    });
    await db.insert(clubMemberships).values({ userId, clubId: completedId, role: "admin" });
    // Draft club
    await makeDraftClub({ userId, status: "draft" });

    const ids = await getUserIdentities(userId);
    expect(ids.clubs).toHaveLength(1);
    expect(ids.clubs[0].clubId).toBe(completedId);
  });
});

describe("nextOnboardingStep", () => {
  function draft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
    return {
      clubId: "c1",
      slug: "x",
      vereinName: "X",
      fussballdeVereinId: null,
      onboardingStatus: "draft",
      onboardingRole: "mannschaft",
      startedAt: new Date(),
      hasStammdaten: false,
      teamCount: 0,
      ...overrides
    };
  }

  it("status=draft + no stammdaten → stammdaten step", () => {
    expect(nextOnboardingStep(draft())).toBe("/onboarding/mannschaft/stammdaten");
  });

  it("status=draft + has stammdaten (edge case) → sponsoren step", () => {
    expect(nextOnboardingStep(draft({ hasStammdaten: true }))).toBe(
      "/onboarding/mannschaft/sponsoren"
    );
  });

  it("status=stammdaten_complete → sponsoren step", () => {
    expect(
      nextOnboardingStep(draft({ onboardingStatus: "stammdaten_complete", hasStammdaten: true }))
    ).toBe("/onboarding/mannschaft/sponsoren");
  });

  it("verein-role routes to /onboarding/verein/...", () => {
    expect(nextOnboardingStep(draft({ onboardingRole: "verein" }))).toBe(
      "/onboarding/verein/stammdaten"
    );
  });
});
