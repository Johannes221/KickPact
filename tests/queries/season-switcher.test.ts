/**
 * W1.3 (Saison-Features 26/27): Saison-Switcher-Query-Layer.
 *
 * - listMatchesForTeam(teamId, limit, { saison }) selektiert per Saison-Fenster
 *   [saisonStartDate(s), saisonStartDate(next(s))) statt des team.saison-Gates.
 * - listAvailableSeasonsForTeam: distinct Saisons mit >= 1 Match (Datums-
 *   Bucketing, Juli-Grenze) ∪ {team.saison}, absteigend sortiert.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import {
  listMatchesForTeam,
  listAvailableSeasonsForTeam
} from "@/lib/db/queries/matches";

async function seedTeam(saison = "2627") {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${createId().slice(0, 8)}`,
      name: "SV Switchertest",
      fussballdeVereinId: createId()
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison,
      fussballdeTeamId: createId(),
      isActive: true
    })
    .returning({ id: teams.id });
  return team.id;
}

async function seedMatch(teamId: string, datum: string) {
  await db.insert(matches).values({
    teamId,
    fussballdeSpielId: createId(),
    datum: new Date(`${datum}T12:00:00Z`),
    heimName: "SV Switchertest",
    gastName: "Gegner",
    ergebnisHeim: 1,
    ergebnisGast: 0,
    status: "finished"
  });
}

describe("listMatchesForTeam — saison-Option (W1.3)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("saison-Option liefert nur Spiele im Fenster [Start, Start+1J)", async () => {
    const teamId = await seedTeam("2627");
    await seedMatch(teamId, "2025-06-15"); // Saison 24/25
    await seedMatch(teamId, "2025-08-10"); // Saison 25/26
    await seedMatch(teamId, "2026-05-20"); // Saison 25/26
    await seedMatch(teamId, "2026-08-01"); // Saison 26/27

    const rows = await listMatchesForTeam(teamId, 20, { saison: "2526" });
    expect(rows.map((r) => r.datum.toISOString().slice(0, 10))).toEqual([
      "2026-05-20",
      "2025-08-10"
    ]);
  });

  it("ohne saison-Option bleibt das team.saison-Gate (nur aktuelle Saison)", async () => {
    const teamId = await seedTeam("2627");
    await seedMatch(teamId, "2026-05-20"); // Vorsaison
    await seedMatch(teamId, "2026-08-01"); // aktuelle Saison

    const rows = await listMatchesForTeam(teamId, 20);
    expect(rows.map((r) => r.datum.toISOString().slice(0, 10))).toEqual([
      "2026-08-01"
    ]);
  });

  it("ungültiger saison-Code fällt aufs team.saison-Gate zurück", async () => {
    const teamId = await seedTeam("2627");
    await seedMatch(teamId, "2026-05-20"); // Vorsaison
    await seedMatch(teamId, "2026-08-01"); // aktuelle Saison

    const rows = await listMatchesForTeam(teamId, 20, { saison: "kaputt" });
    expect(rows.map((r) => r.datum.toISOString().slice(0, 10))).toEqual([
      "2026-08-01"
    ]);
  });
});

describe("listAvailableSeasonsForTeam (W1.3)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("bucketet Matches per Juli-Grenze und ergänzt team.saison, absteigend", async () => {
    const teamId = await seedTeam("2627");
    await seedMatch(teamId, "2024-05-01"); // 23/24 (Mai → Vorjahr)
    await seedMatch(teamId, "2025-09-10"); // 25/26
    await seedMatch(teamId, "2026-03-01"); // 25/26 (dedupe)
    await seedMatch(teamId, "2026-07-01"); // 26/27 (Juli-Grenze inklusiv)

    await expect(listAvailableSeasonsForTeam(teamId)).resolves.toEqual([
      "2627",
      "2526",
      "2324"
    ]);
  });

  it("ohne Matches nur team.saison", async () => {
    const teamId = await seedTeam("2627");
    await expect(listAvailableSeasonsForTeam(teamId)).resolves.toEqual(["2627"]);
  });

  it("leeres Array für unbekannte Teams", async () => {
    await expect(listAvailableSeasonsForTeam("gibt-es-nicht")).resolves.toEqual([]);
  });
});
