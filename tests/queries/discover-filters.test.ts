import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, seasonResults } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { listDiscoverableTeams, getPublicTeamProfileBySlug } from "@/lib/db/queries/sponsor-discover";

async function makeTeam(opts: {
  clubName: string; ort: string; league: string | null; verified: boolean;
  discoverable?: boolean; slug?: string;
}) {
  const [club] = await db.insert(clubs).values({
    slug: `c-${createId().slice(0,6)}`, name: opts.clubName, ort: opts.ort, fussballdeVereinId: createId()
  }).returning({ id: clubs.id });
  const [team] = await db.insert(teams).values({
    clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true,
    discoverable: opts.discoverable ?? true, verifiedAt: opts.verified ? new Date() : null,
    league: opts.league, publicSlug: opts.slug ?? null
  }).returning({ id: teams.id });
  return { teamId: team.id, clubId: club.id };
}

describe("listDiscoverableTeams — gate + filters", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("zeigt nur verifizierte Teams (Gate)", async () => {
    await makeTeam({ clubName: "Verein A", ort: "Dossenheim", league: "Kreisliga", verified: true });
    await makeTeam({ clubName: "Verein B", ort: "Dossenheim", league: "Kreisliga", verified: false });
    const rows = await listDiscoverableTeams({});
    expect(rows.length).toBe(1);
    expect(rows[0].clubName).toBe("Verein A");
  });

  it("filtert nach Liga und Ort", async () => {
    await makeTeam({ clubName: "A", ort: "Dossenheim", league: "Kreisliga", verified: true });
    await makeTeam({ clubName: "B", ort: "Mannheim", league: "Kreisliga", verified: true });
    await makeTeam({ clubName: "C", ort: "Dossenheim", league: "Bezirksliga", verified: true });
    expect((await listDiscoverableTeams({ league: "Kreisliga" })).length).toBe(2);
    expect((await listDiscoverableTeams({ ort: "Dossenheim" })).length).toBe(2);
    expect((await listDiscoverableTeams({ league: "Kreisliga", ort: "Dossenheim" })).length).toBe(1);
  });

  it("liefert Vorjahres-Platzierung aus der jüngsten Vorsaison", async () => {
    const { teamId } = await makeTeam({ clubName: "A", ort: "X", league: "Kreisliga", verified: true });
    await db.insert(seasonResults).values({ teamId, saison: "2024/25", finalPosition: 2, promoted: true });
    const [row] = await listDiscoverableTeams({});
    expect(row.lastSeasonPosition).toBe(2);
    expect(row.lastSeasonPromoted).toBe(true);
  });
});

describe("getPublicTeamProfileBySlug — verif gate", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert null für unverifiziertes, aber discoverable Team", async () => {
    await makeTeam({ clubName: "Unverif", ort: "X", league: "Kreisliga", verified: false, slug: "unverif-team-x" });
    expect(await getPublicTeamProfileBySlug("unverif-team-x")).toBeNull();
  });

  it("liefert Profil für verifiziertes Team", async () => {
    await makeTeam({ clubName: "Verif", ort: "X", league: "Kreisliga", verified: true, slug: "verif-team-x" });
    const p = await getPublicTeamProfileBySlug("verif-team-x");
    expect(p).not.toBeNull();
  });
});
