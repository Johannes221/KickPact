import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { listDiscoveryFacets } from "@/lib/db/queries/sponsor-discover";

async function seed(clubName: string, ort: string, league: string | null, verified: boolean) {
  const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, ort, fussballdeVereinId: createId() }).returning({ id: clubs.id });
  await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true, discoverable: true, verifiedAt: verified ? new Date() : null, league });
}

describe("listDiscoveryFacets", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert distinkte, sortierte Ligen/Orte nur aus auffindbaren Teams", async () => {
    await seed("A", "Mannheim", "Kreisliga", true);
    await seed("B", "Dossenheim", "Bezirksliga", true);
    await seed("C", "Dossenheim", "Kreisliga", true);
    await seed("D", "Heidelberg", "Landesliga", false); // unverifiziert → ignoriert
    const f = await listDiscoveryFacets();
    expect(f.leagues).toEqual(["Bezirksliga", "Kreisliga"]);
    expect(f.orte).toEqual(["Dossenheim", "Mannheim"]);
  });
});
