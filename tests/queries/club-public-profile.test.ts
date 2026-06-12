import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  getPublicClubProfileBySlug,
  listVerifiedClubSlugs
} from "@/lib/db/queries/club-public-profile";

async function seedClub(overrides: Partial<typeof clubs.$inferInsert> = {}) {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `fc-test-${createId().slice(0, 6)}`,
      name: "FC Test 1910",
      ort: "Dossenheim",
      verifiedAt: new Date(),
      descriptionMd: "Wir sind der FC.\n\nSeit 1910.",
      heroUrl: "r2://b/clubs/x/hero-1.jpg",
      ...overrides
    })
    .returning();
  return club;
}

describe("getPublicClubProfileBySlug", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert Stammdaten + Beschreibung + Hero für verifizierte Clubs", async () => {
    const club = await seedClub();
    const p = await getPublicClubProfileBySlug(club.slug);
    expect(p).not.toBeNull();
    expect(p!.name).toBe("FC Test 1910");
    expect(p!.ort).toBe("Dossenheim");
    expect(p!.descriptionMd).toContain("Seit 1910");
    expect(p!.heroUrl).toBe(`/api/clubs/${club.id}/hero`);
    expect(p!.slug).toBe(club.slug);
  });

  it("Gate: unverifizierter Club → null", async () => {
    const club = await seedClub({ verifiedAt: null });
    expect(await getPublicClubProfileBySlug(club.slug)).toBeNull();
  });

  it("unbekannter Slug / leerer Slug → null", async () => {
    expect(await getPublicClubProfileBySlug("gibt-es-nicht")).toBeNull();
    expect(await getPublicClubProfileBySlug("  ")).toBeNull();
  });

  it("Teams: alle aktiven Teams, publicSlug nur wenn öffentlich (/m/-Gate)", async () => {
    const club = await seedClub();
    // Öffentlich: publicSlug + discoverable + aktiv + verifiziert
    await db.insert(teams).values({
      clubId: club.id,
      name: "1. Herren",
      saison: "2526",
      league: "Kreisliga A",
      isActive: true,
      discoverable: true,
      publicSlug: "fc-test-1-herren-ab12",
      verifiedAt: new Date()
    });
    // Nicht verlinkbar: hat publicSlug, aber nicht discoverable
    await db.insert(teams).values({
      clubId: club.id,
      name: "2. Herren",
      saison: "2526",
      isActive: true,
      discoverable: false,
      publicSlug: "fc-test-2-herren-cd34",
      verifiedAt: new Date()
    });
    // Nicht verlinkbar: nie veröffentlicht
    await db.insert(teams).values({
      clubId: club.id,
      name: "A-Jugend",
      saison: "2526",
      isActive: true
    });
    // Inaktiv → taucht gar nicht auf
    await db.insert(teams).values({
      clubId: club.id,
      name: "Alte Herren",
      saison: "2526",
      isActive: false
    });

    const p = await getPublicClubProfileBySlug(club.slug);
    expect(p).not.toBeNull();
    expect(p!.teams.map((t) => t.name).sort()).toEqual([
      "1. Herren",
      "2. Herren",
      "A-Jugend"
    ]);
    const erste = p!.teams.find((t) => t.name === "1. Herren")!;
    expect(erste.publicSlug).toBe("fc-test-1-herren-ab12");
    expect(erste.league).toBe("Kreisliga A");
    expect(erste.saison).toBe("2526");
    expect(p!.teams.find((t) => t.name === "2. Herren")!.publicSlug).toBeNull();
    expect(p!.teams.find((t) => t.name === "A-Jugend")!.publicSlug).toBeNull();
  });

  it("hero null → heroUrl null", async () => {
    const club = await seedClub({ heroUrl: null });
    const p = await getPublicClubProfileBySlug(club.slug);
    expect(p!.heroUrl).toBeNull();
  });
});

describe("listVerifiedClubSlugs", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert nur verifizierte Clubs", async () => {
    const a = await seedClub();
    await seedClub({ verifiedAt: null });
    const slugs = await listVerifiedClubSlugs();
    expect(slugs).toEqual([a.slug]);
  });
});
