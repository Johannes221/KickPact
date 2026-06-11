/**
 * DB-Level-Tests für den „Letzte Saison"-Query-Layer (Paket S, Design 9):
 * listPreviousSeasonMatches, getPreviousSeasonRecord, getPreviousSeasonDisplay.
 *
 * Die Vorsaison-Historie liegt nach dem Saison-Bump auf DERSELBEN Team-Row
 * und wird rein über das Datums-Fenster [Vorjahres-Juli, Saisonstart-Juli)
 * selektiert.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import {
  listPreviousSeasonMatches,
  getPreviousSeasonRecord,
  getPreviousSeasonDisplay
} from "@/lib/db/queries/matches";

const CLUB_NAME = "Sportfreunde Testkirchen";

async function seedTeam(saison = "2526") {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${createId().slice(0, 8)}`,
      name: CLUB_NAME,
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

type MatchSeed = {
  datum: string;
  heim?: string;
  gast?: string;
  eh?: number | null;
  eg?: number | null;
  status?: "finished" | "scheduled";
};

async function seedMatch(teamId: string, m: MatchSeed) {
  await db.insert(matches).values({
    teamId,
    fussballdeSpielId: createId(),
    datum: new Date(`${m.datum}T12:00:00Z`),
    heimName: m.heim ?? CLUB_NAME,
    gastName: m.gast ?? "Gegner",
    ergebnisHeim: m.eh ?? null,
    ergebnisGast: m.eg ?? null,
    status: m.status ?? "finished"
  });
}

describe("listPreviousSeasonMatches", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert nur finished-Spiele im Vorsaison-Fenster, neueste zuerst", async () => {
    const teamId = await seedTeam("2526"); // Vorsaison-Fenster: 2024-07-01 .. 2025-07-01
    await seedMatch(teamId, { datum: "2024-08-10", eh: 1, eg: 0 }); // Vorsaison
    await seedMatch(teamId, { datum: "2025-05-20", eh: 2, eg: 2 }); // Vorsaison
    await seedMatch(teamId, { datum: "2025-09-01", eh: 3, eg: 0 }); // aktuelle Saison
    await seedMatch(teamId, { datum: "2024-06-15", eh: 4, eg: 0 }); // Vor-Vorsaison
    await seedMatch(teamId, { datum: "2025-04-01", status: "scheduled" }); // kein Ergebnis

    const rows = await listPreviousSeasonMatches(teamId);
    expect(rows.map((r) => r.datum.toISOString().slice(0, 10))).toEqual([
      "2025-05-20",
      "2024-08-10"
    ]);
  });

  it("leeres Array für unbekannte Teams", async () => {
    await expect(listPreviousSeasonMatches("gibt-es-nicht")).resolves.toEqual([]);
  });

  it("respektiert das Limit", async () => {
    const teamId = await seedTeam("2526");
    for (let i = 1; i <= 6; i++) {
      await seedMatch(teamId, { datum: `2024-09-0${i}`, eh: 1, eg: 1 });
    }
    await expect(listPreviousSeasonMatches(teamId, 4)).resolves.toHaveLength(4);
  });
});

describe("getPreviousSeasonRecord", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("berechnet S/U/N + Tore mit Heim/Auswärts-Erkennung", async () => {
    const teamId = await seedTeam("2526");
    // Heimsieg 3:1
    await seedMatch(teamId, { datum: "2024-09-01", heim: CLUB_NAME, gast: "Gegner A", eh: 3, eg: 1 });
    // Auswärtssieg 0:2 (Team ist Gast)
    await seedMatch(teamId, { datum: "2024-10-01", heim: "Gegner B", gast: CLUB_NAME, eh: 0, eg: 2 });
    // Auswärtsniederlage 4:1
    await seedMatch(teamId, { datum: "2024-11-01", heim: "Gegner C", gast: CLUB_NAME, eh: 4, eg: 1 });
    // Heim-Unentschieden 2:2
    await seedMatch(teamId, { datum: "2025-03-01", heim: CLUB_NAME, gast: "Gegner D", eh: 2, eg: 2 });

    await expect(getPreviousSeasonRecord(teamId)).resolves.toEqual({
      spiele: 4,
      siege: 2,
      unentschieden: 1,
      niederlagen: 1,
      torePlus: 3 + 2 + 1 + 2,
      toreMinus: 1 + 0 + 4 + 2
    });
  });

  it("null ohne Vorsaison-Spiele", async () => {
    const teamId = await seedTeam("2526");
    await seedMatch(teamId, { datum: "2025-09-01", eh: 3, eg: 0 }); // nur aktuelle Saison
    await expect(getPreviousSeasonRecord(teamId)).resolves.toBeNull();
  });
});

describe("getPreviousSeasonDisplay", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert Label + Bilanz + letzte Spiele, wenn aktuelle Saison < 3 gespielte hat", async () => {
    const teamId = await seedTeam("2526");
    for (let i = 1; i <= 7; i++) {
      await seedMatch(teamId, { datum: `2025-03-0${i}`, eh: 1, eg: 0 }); // Vorsaison
    }
    await seedMatch(teamId, { datum: "2025-08-10", eh: 2, eg: 0 }); // 1 aktuelles Spiel

    const display = await getPreviousSeasonDisplay(teamId);
    expect(display).not.toBeNull();
    expect(display!.prevSaison).toBe("2425");
    expect(display!.prevSaisonLabel).toBe("24/25");
    expect(display!.record.spiele).toBe(7);
    expect(display!.recentMatches).toHaveLength(5); // Default-Limit
  });

  it("null, sobald die aktuelle Saison >= 3 gespielte Spiele hat", async () => {
    const teamId = await seedTeam("2526");
    await seedMatch(teamId, { datum: "2025-03-01", eh: 1, eg: 0 }); // Vorsaison vorhanden
    for (let i = 1; i <= 3; i++) {
      await seedMatch(teamId, { datum: `2025-09-0${i}`, eh: 1, eg: 0 });
    }
    await expect(getPreviousSeasonDisplay(teamId)).resolves.toBeNull();
  });

  it("null ohne Vorsaison-Historie (frisches Team, Backfill fand nichts)", async () => {
    const teamId = await seedTeam("2526");
    await expect(getPreviousSeasonDisplay(teamId)).resolves.toBeNull();
  });
});
