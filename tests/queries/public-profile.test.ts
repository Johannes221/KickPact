import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, teamImages } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";

describe("getPublicTeamProfileBySlug (erweitert)", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert Cover-/Galerie-/Liga-Felder + Insights-Flag", async () => {
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: "FC Test", ort: "Dossenheim", fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({
      clubId: club.id, name: "2. Herren", saison: "2526", fussballdeTeamId: createId(),
      isActive: true, discoverable: true, publicSlug: "fc-test-2-herren-ab12",
      coverUrl: "r2://b/teams/x/cover.jpg", league: "Kreisliga", showInsights: true,
      verifiedAt: new Date() // Gate: nur verifizierte Teams sind öffentlich sichtbar
    }).returning({ id: teams.id });
    await db.insert(teamImages).values({ teamId: team.id, storageKey: "r2://b/teams/x/gallery-1.jpg", sortOrder: 0 });

    const p = await getPublicTeamProfileBySlug("fc-test-2-herren-ab12");
    expect(p).not.toBeNull();
    expect(p!.league).toBe("Kreisliga");
    expect(p!.clubOrt).toBe("Dossenheim");
    expect(p!.showInsights).toBe(true);
    expect(p!.gallery.length).toBe(1);
    expect(p!.coverUrl).not.toBeNull();
  });
});
