import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

// requireUser muss VOR den Action-Imports gemockt sein.
const { mockUserId } = vi.hoisted(() => ({
  mockUserId: { current: "" }
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@kickpact.local`
  }))
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
  teamLicenses,
  subscriptions
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import { createDraftClub } from "@/app/(onboarding)/onboarding/_actions/create-draft-club";
import { updateDraftStammdaten } from "@/app/(onboarding)/onboarding/_actions/update-draft-stammdaten";
import { completeOnboarding } from "@/app/(onboarding)/onboarding/_actions/complete-onboarding";

async function makeUser(): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `${id}@kickpact.local`,
    emailVerified: true,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  mockUserId.current = id;
  return id;
}

describe("createDraftClub", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("legt für mannschaft-role 1 Team mit plan=pro an", async () => {
    await makeUser();
    const result = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V100", name: "FC Test" },
      team: { teamId: "T100", teamSlug: "1-herren", teamName: "1. Herren", saison: "2526" }
    });

    expect(result.teams).toHaveLength(1);

    const [club] = await db.select().from(clubs).where(eq(clubs.id, result.clubId));
    expect(club.onboardingStatus).toBe("draft");
    expect(club.onboardingRole).toBe("mannschaft");
    expect(club.fussballdeVereinId).toBe("V100");

    const teamRows = await db.select().from(teams).where(eq(teams.clubId, result.clubId));
    expect(teamRows).toHaveLength(1);

    const licenseRows = await db
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.subscriptionClubId, result.clubId));
    expect(licenseRows).toHaveLength(1);
    expect(licenseRows[0].plan).toBe("pro");

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.clubId, result.clubId));
    expect(sub.status).toBe("trialing");
    expect(sub.trialEndsAt).not.toBeNull();
  });

  it("legt für verein-role mehrere Teams mit plan=verein an", async () => {
    await makeUser();
    const result = await createDraftClub({
      role: "verein",
      verein: { vereinId: "V200", name: "TSV Multi" },
      teams: [
        { teamId: "T1", teamSlug: "h1", teamName: "1. Herren", saison: "2526" },
        { teamId: "T2", teamSlug: "h2", teamName: "2. Herren", saison: "2526" },
        { teamId: "T3", teamSlug: "aj", teamName: "A-Jugend", saison: "2526" }
      ]
    });

    expect(result.teams).toHaveLength(3);
    const licenses = await db
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.subscriptionClubId, result.clubId));
    expect(licenses).toHaveLength(3);
    for (const l of licenses) expect(l.plan).toBe("verein");

    const [club] = await db.select().from(clubs).where(eq(clubs.id, result.clubId));
    expect(club.onboardingRole).toBe("verein");
  });

  it("ist idempotent für denselben vereinId vom selben User", async () => {
    await makeUser();
    const first = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V300", name: "Idempo" },
      team: { teamId: "T300", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });
    const second = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V300", name: "Idempo" },
      team: { teamId: "T300", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });

    expect(second.clubId).toBe(first.clubId);
    // Es sollte trotz Idempotenz nur EIN Team in der DB sein.
    const teamRows = await db.select().from(teams).where(eq(teams.clubId, first.clubId));
    expect(teamRows).toHaveLength(1);
  });

  it("blockt Übernahme eines bereits anderem User gehörenden Vereins", async () => {
    const otherUser = await makeUser();
    await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V400", name: "Other" },
      team: { teamId: "T400", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });

    await makeUser(); // wechselt mockUserId zu neuem User
    await expect(
      createDraftClub({
        role: "mannschaft",
        verein: { vereinId: "V400", name: "Other" },
        team: { teamId: "T400", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
      })
    ).rejects.toThrow(/bereits bei KickPact/);

    expect(otherUser).toBeTruthy(); // make linter happy
  });
});

describe("updateDraftStammdaten", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("schreibt Adresse und bumpt Status auf stammdaten_complete", async () => {
    await makeUser();
    const draft = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V500", name: "Stamm Test" },
      team: { teamId: "T500", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });

    await updateDraftStammdaten({
      clubId: draft.clubId,
      street: "Hauptstr 1",
      zip: "12345",
      city: "Berlin",
      isSmallBusiness: true,
      iban: "DE89370400440532013000"
    });

    const [club] = await db.select().from(clubs).where(eq(clubs.id, draft.clubId));
    expect(club.onboardingStatus).toBe("stammdaten_complete");
    expect(club.ort).toBe("Berlin");
    expect(club.iban).toBe("DE89370400440532013000");
    expect(club.isSmallBusiness).toBe(true);
    expect(club.addressJson).toEqual({
      street: "Hauptstr 1",
      zip: "12345",
      city: "Berlin",
      country: "DE"
    });
  });

  it("wirft wenn User nicht admin ist", async () => {
    const ownerId = await makeUser();
    const draft = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V501", name: "Other Owner" },
      team: { teamId: "T501", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });

    // Wechsel zu fremdem User
    await makeUser();
    await expect(
      updateDraftStammdaten({
        clubId: draft.clubId,
        street: "X",
        zip: "12345",
        city: "Y",
        isSmallBusiness: false
      })
    ).rejects.toThrow(/nicht berechtigt/);

    expect(ownerId).toBeTruthy();
  });

  it("wirft wenn Club bereits completed ist", async () => {
    await makeUser();
    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `done-${clubId.slice(0, 6)}`,
      name: "Already Done"
    });
    await db.insert(clubMemberships).values({
      userId: mockUserId.current,
      clubId,
      role: "admin"
    });

    await expect(
      updateDraftStammdaten({
        clubId,
        street: "X",
        zip: "12345",
        city: "Y",
        isSmallBusiness: false
      })
    ).rejects.toThrow(/vollständig onboarded/);
  });
});

describe("completeOnboarding", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("setzt Status auf completed + completedAt", async () => {
    await makeUser();
    const draft = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V600", name: "Complete Me" },
      team: { teamId: "T600", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });
    await updateDraftStammdaten({
      clubId: draft.clubId,
      street: "X",
      zip: "12345",
      city: "Y",
      isSmallBusiness: false
    });

    const result = await completeOnboarding({ clubId: draft.clubId });
    expect(result.clubSlug).toBe(draft.clubSlug);

    const [club] = await db.select().from(clubs).where(eq(clubs.id, draft.clubId));
    expect(club.onboardingStatus).toBe("completed");
    expect(club.onboardingCompletedAt).not.toBeNull();
  });

  it("ist idempotent für bereits completed Clubs", async () => {
    await makeUser();
    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `c-${clubId.slice(0, 6)}`,
      name: "Already",
      onboardingStatus: "completed",
      onboardingCompletedAt: new Date()
    });
    await db.insert(clubMemberships).values({
      userId: mockUserId.current,
      clubId,
      role: "admin"
    });

    const result = await completeOnboarding({ clubId });
    expect(result.clubSlug).toContain("c-");
  });

  it("wirft wenn Status noch draft ist (Stammdaten fehlen)", async () => {
    await makeUser();
    const draft = await createDraftClub({
      role: "mannschaft",
      verein: { vereinId: "V700", name: "No Stamm" },
      team: { teamId: "T700", teamSlug: "h1", teamName: "1. Herren", saison: "2526" }
    });

    await expect(completeOnboarding({ clubId: draft.clubId })).rejects.toThrow(
      /Stammdaten/
    );
  });
});
