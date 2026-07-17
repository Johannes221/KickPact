import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { computeTeamSeasonStats } from "@/lib/db/queries/team-dashboard";
import { storeStandings } from "@/lib/db/queries/standings";

describe("computeTeamSeasonStats", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("zählt S/U/N + Tore korrekt (Heim/Auswärts)", async () => {
    // Vereinsname braucht mindestens ein Token mit ≥5 Zeichen, damit detectTeamSide
    // Heim/Auswärts korrekt erkennt (ROLE_WORDS + Längen-Filter in team-side.ts).
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    // Datum INNERHALB des 2526-Fensters [2025-07-01, 2026-07-01) — `new Date()`
    // wäre je nach Testlauf-Datum außerhalb der geseedeten Saison.
    // Heimsieg 3:1
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 3, ergebnisGast: 1 });
    // Auswärtsniederlage 0:2 (Team ist Gast)
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-21T12:00:00Z"), heimName: "Gegner B", gastName: clubName, status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.games).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.draws).toBe(0);
    // goalsFor: Heim 3 (Heimsieg) + Gast 0 (Auswärtsniederlage) = 3
    expect(s.goalsFor).toBe(3);
    // goalsAgainst: Gast 1 (Heimsieg) + Heim 2 (Auswärtsniederlage) = 3
    expect(s.goalsAgainst).toBe(3);
  });

  it("zählt NUR die aktuelle Saison — Vorsaison-Backfill-Rows verschmutzen die Stats nicht", async () => {
    // Der Vorsaison-Backfill (backfill-team-history) legt finished-Rows MIT
    // Ergebnis aus der VORSAISON auf derselben Team-Row an. Die Saison-Stats
    // des Dashboards/öffentlichen Profils müssen aufs Saison-Fenster
    // (datum >= saisonStartDate) beschränkt bleiben.
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    // Aktuelle Saison (2526): 1 Heimsieg.
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });
    // Vorsaison (2425, Backfill): 2 Spiele — dürfen NICHT mitzählen.
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2024-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner B", status: "finished", ergebnisHeim: 5, ergebnisGast: 5 });
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-05-11T12:00:00Z"), heimName: "Gegner C", gastName: clubName, status: "finished", ergebnisHeim: 1, ergebnisGast: 0 });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.games).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.draws).toBe(0);
    expect(s.losses).toBe(0);
    expect(s.goalsFor).toBe(2);
    expect(s.goalsAgainst).toBe(0);
    expect(s.source).toBe("matches");
  });

  /**
   * Kern der Regression (verifiziert 2026-07-17 auf Staging): getSpiele cappt bei
   * ~10 Spielen. Eine mitten in der Saison onboardete Mannschaft hat die früheren
   * Spieltage nie in der DB und zeigte die Teil-Bilanz als Saison-Bilanz — auch
   * öffentlich auf /m/[slug]. Die Liga-Tabelle kennt die volle Saison und geht vor.
   */
  it("nimmt die Liga-Tabelle, wenn sie mehr Spiele kennt als in der DB liegen", async () => {
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const fid = createId();
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: fid, isActive: true }).returning({ id: teams.id });
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });

    const ownRow = {
      position: 10, teamName: clubName, teamId: fid, spiele: 34,
      siege: 14, unentschieden: 4, niederlagen: 16,
      toreFor: 62, toreAgainst: 80, punkte: 46
    };
    await storeStandings(team.id, "2526", {
      teamsInLeague: 18, rows: [ownRow], ownRow, topScorers: [], ownTopScorers: [], fairnessOwnRow: null
    });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.source).toBe("table");
    expect(s.games).toBe(34);
    expect(s.wins).toBe(14);
    expect(s.goalsFor).toBe(62);
    expect(s.position).toBe(10);
    expect(s.teamsInLeague).toBe(18);
  });

  /**
   * Das Fenster ist halb-offen [Saisonstart, Start der Folgesaison). Ohne
   * Obergrenze zählten Spiele der FOLGE-Saison mit (teams.saison kann dem
   * Kalender hinterherhängen) — verglichen gegen eine Tabelle, die nur eine
   * Saison kennt, wären das ungleiche Grundmengen.
   */
  it("zählt keine Spiele der Folgesaison mit", async () => {
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    // In der Saison 2526 — zählt.
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });
    // Schon Saison 2627 (nach dem 1.7.2026) — darf NICHT zählen.
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2026-08-15T12:00:00Z"), heimName: clubName, gastName: "Gegner B", status: "finished", ergebnisHeim: 5, ergebnisGast: 0 });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.games).toBe(1);
    expect(s.goalsFor).toBe(2);
  });

  /**
   * Live gesehen (2026-07-17, /m/fg-union-…): „1 Spiele · Bilanz 0/1/0 · Tore 0:0"
   * — das war das 0:0-TESTSPIEL vom 12.07. Freundschaftsspiele sind kein Teil
   * der Saison-Bilanz; die Liga-Tabelle zählt sie auch nicht. Sie hier
   * mitzuzählen macht die Kacheln nicht nur schief, sondern auch unvergleichbar
   * mit der Tabelle, gegen die `resolveSeasonAggregate` sie hält.
   * Pokalspiele bleiben drin: echter Wettkampf, und sie zahlen auch.
   */
  it("zählt Freundschaftsspiele NICHT in die Saison-Bilanz", async () => {
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    // Ligaspiel: zählt.
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 3, ergebnisGast: 0, competitionType: "league" });
    // Pokalspiel: zählt auch (echter Wettkampf).
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-21T12:00:00Z"), heimName: clubName, gastName: "Gegner B", status: "finished", ergebnisHeim: 1, ergebnisGast: 0, competitionType: "cup" });
    // Freundschaftsspiel: darf NICHT zählen.
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-07-10T12:00:00Z"), heimName: clubName, gastName: "Gegner C", status: "finished", ergebnisHeim: 0, ergebnisGast: 5, competitionType: "friendly" });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.games).toBe(2);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(0); // die 0:5-Klatsche im Testspiel taucht nicht auf
    expect(s.goalsFor).toBe(4);
    expect(s.goalsAgainst).toBe(0);
  });

  /** `unknown` (Alt-Bestand) zählt weiter — sonst verschwinden Bestandsspiele. */
  it("zählt Spiele mit unbekanntem Wettbewerb weiter mit", async () => {
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date("2025-09-14T12:00:00Z"), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.games).toBe(1);
  });

  /** Teilrunden-Tabelle (Jugend: Vor-/Endrunde) darf belegte Spiele nicht wegwerfen. */
  it("ignoriert eine Tabelle, die weniger Spiele kennt als in der DB liegen", async () => {
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const fid = createId();
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: fid, isActive: true }).returning({ id: teams.id });
    for (const d of ["2025-09-14", "2025-09-21", "2025-09-28"]) {
      await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(`${d}T12:00:00Z`), heimName: clubName, gastName: "Gegner", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });
    }
    const ownRow = {
      position: 4, teamName: clubName, teamId: fid, spiele: 2,
      siege: 1, unentschieden: 0, niederlagen: 1,
      toreFor: 3, toreAgainst: 4, punkte: 3
    };
    await storeStandings(team.id, "2526", {
      teamsInLeague: 10, rows: [ownRow], ownRow, topScorers: [], ownTopScorers: [], fairnessOwnRow: null
    });

    const s = await computeTeamSeasonStats(team.id, team.name, clubName);
    expect(s.source).toBe("matches");
    expect(s.games).toBe(3);
    expect(s.position).toBeNull();
  });
});
