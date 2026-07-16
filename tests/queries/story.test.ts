/**
 * Integration-Tests für den Story-Query-Layer (Aufgabe #44) gegen die
 * Docker-Test-DB.
 *
 * Geprüft wird, was die Story still falsch machen könnte:
 *  - „nächstes Spiel" nimmt wirklich das nächste ANSTEHENDE (nicht das
 *    abgesagte, nicht das gespielte, nicht das von gestern),
 *  - Torschützen zählen Doppelpacks als 2 und ignorieren die Gegenseite,
 *  - der Tenant-Filter auf matchId hält (fremdes Spiel → null),
 *  - Gegner-Logo nur bei öffentlicher (discoverable) Mannschaft.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, matches, matchEvents } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  getNextMatchForTeam,
  getStoryMatch,
  getMatchScorers,
  getOpponentLogoUrl
} from "@/lib/db/queries/story";

const NOW = new Date("2026-09-15T10:00:00Z");

async function seedTeam(opts: { name?: string; fussballdeTeamId?: string } = {}) {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${createId().slice(0, 8)}`,
      name: "SV Testkirchen",
      fussballdeVereinId: createId()
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: opts.name ?? "1. Herren",
      saison: "2627",
      fussballdeTeamId: opts.fussballdeTeamId ?? createId(),
      league: "Kreisliga A"
    })
    .returning({ id: teams.id, fussballdeTeamId: teams.fussballdeTeamId });
  return team;
}

async function seedMatch(
  teamId: string,
  v: {
    datum: Date;
    status?: "scheduled" | "finished" | "cancelled" | "postponed" | "live";
    heimName?: string;
    gastName?: string;
    ergebnisHeim?: number | null;
    ergebnisGast?: number | null;
  }
) {
  const [m] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: createId(),
      datum: v.datum,
      status: v.status ?? "scheduled",
      heimName: v.heimName ?? "SV Testkirchen",
      gastName: v.gastName ?? "FC Gegner",
      ergebnisHeim: v.ergebnisHeim ?? null,
      ergebnisGast: v.ergebnisGast ?? null
    })
    .returning({ id: matches.id });
  return m.id;
}

beforeEach(async () => {
  await resetTestDb();
});

describe("getNextMatchForTeam", () => {
  it("nimmt das zeitlich nächste anstehende Spiel", async () => {
    const team = await seedTeam();
    await seedMatch(team.id, { datum: new Date("2026-09-27T12:00:00Z") });
    const naechstes = await seedMatch(team.id, {
      datum: new Date("2026-09-20T12:00:00Z")
    });

    const res = await getNextMatchForTeam(team.id, NOW);
    expect(res?.id).toBe(naechstes);
  });

  it("ignoriert vergangene und bereits gespielte Spiele", async () => {
    const team = await seedTeam();
    await seedMatch(team.id, {
      datum: new Date("2026-09-13T12:00:00Z"),
      status: "finished",
      ergebnisHeim: 2,
      ergebnisGast: 0
    });
    const kommend = await seedMatch(team.id, {
      datum: new Date("2026-09-20T12:00:00Z")
    });

    const res = await getNextMatchForTeam(team.id, NOW);
    expect(res?.id).toBe(kommend);
  });

  it("kündigt abgesagte Spiele nicht an", async () => {
    const team = await seedTeam();
    await seedMatch(team.id, {
      datum: new Date("2026-09-20T12:00:00Z"),
      status: "cancelled"
    });

    expect(await getNextMatchForTeam(team.id, NOW)).toBeNull();
  });

  it("ohne anstehendes Spiel (Sommerpause) → null, Karte entfällt", async () => {
    const team = await seedTeam();
    expect(await getNextMatchForTeam(team.id, NOW)).toBeNull();
  });

  it("liefert die eigene Spielseite mit", async () => {
    const team = await seedTeam({ name: "SV Testkirchen" });
    await seedMatch(team.id, {
      datum: new Date("2026-09-20T12:00:00Z"),
      heimName: "FC Auswärts",
      gastName: "SV Testkirchen"
    });

    const res = await getNextMatchForTeam(team.id, NOW);
    expect(res?.ownSide).toBe("gast");
  });
});

describe("getStoryMatch — Tenant-Filter", () => {
  it("liefert das eigene Spiel", async () => {
    const team = await seedTeam();
    const id = await seedMatch(team.id, { datum: new Date("2026-09-20T12:00:00Z") });
    expect((await getStoryMatch(team.id, id))?.id).toBe(id);
  });

  it("liefert NICHT das Spiel einer fremden Mannschaft", async () => {
    const a = await seedTeam();
    const b = await seedTeam();
    const fremdesSpiel = await seedMatch(b.id, {
      datum: new Date("2026-09-20T12:00:00Z")
    });

    // matchId kommt aus der URL — ohne teamId-Filter wäre das ein
    // Cross-Tenant-Render.
    expect(await getStoryMatch(a.id, fremdesSpiel)).toBeNull();
  });
});

describe("getMatchScorers", () => {
  it("zählt Doppelpacks und sortiert nach Toren", async () => {
    const team = await seedTeam();
    const matchId = await seedMatch(team.id, {
      datum: new Date("2026-09-13T12:00:00Z"),
      status: "finished",
      ergebnisHeim: 3,
      ergebnisGast: 0
    });
    await db.insert(matchEvents).values([
      { matchId, type: "tor", side: "heim", playerName: "Max Muster", source: "scraped" },
      { matchId, type: "tor", side: "heim", playerName: "Max Muster", source: "scraped" },
      { matchId, type: "tor", side: "heim", playerName: "Ali Veli", source: "scraped" }
    ]);

    const res = await getMatchScorers(matchId, "heim");
    expect(res).toEqual([
      { name: "Max Muster", tore: 2 },
      { name: "Ali Veli", tore: 1 }
    ]);
  });

  it("nimmt nur Tore der angefragten Seite und keine anderen Event-Typen", async () => {
    const team = await seedTeam();
    const matchId = await seedMatch(team.id, {
      datum: new Date("2026-09-13T12:00:00Z"),
      status: "finished",
      ergebnisHeim: 1,
      ergebnisGast: 1
    });
    await db.insert(matchEvents).values([
      { matchId, type: "tor", side: "heim", playerName: "Eigen Tor", source: "scraped" },
      { matchId, type: "tor", side: "gast", playerName: "Gegner Spieler", source: "scraped" },
      { matchId, type: "karte", side: "heim", playerName: "Gelb Spieler", source: "scraped" }
    ]);

    expect(await getMatchScorers(matchId, "heim")).toEqual([
      { name: "Eigen Tor", tore: 1 }
    ]);
  });

  it("Tore ohne Spielernamen fallen raus statt als Platzhalter zu landen", async () => {
    const team = await seedTeam();
    const matchId = await seedMatch(team.id, {
      datum: new Date("2026-09-13T12:00:00Z"),
      status: "finished",
      ergebnisHeim: 2,
      ergebnisGast: 0
    });
    // Realer fussball.de-Fall: Ergebnis da, Torschützen namenlos.
    await db.insert(matchEvents).values([
      { matchId, type: "tor", side: "heim", playerName: null, source: "scraped" },
      { matchId, type: "tor", side: "heim", playerName: "", source: "scraped" }
    ]);

    expect(await getMatchScorers(matchId, "heim")).toEqual([]);
  });
});

describe("getOpponentLogoUrl", () => {
  it("übernimmt das Logo nur bei öffentlicher (discoverable) Mannschaft", async () => {
    const gegner = await seedTeam({ fussballdeTeamId: "fd-gegner-1" });
    await db
      .update(teams)
      .set({ logoUrl: "r2://bucket/teams/x/logo.png", discoverable: true })
      .where(eq(teams.id, gegner.id));

    expect(await getOpponentLogoUrl("fd-gegner-1")).toBe("r2://bucket/teams/x/logo.png");
  });

  it("nicht-öffentliche Mannschaft: kein Logo (fremdes Asset, keine Einwilligung)", async () => {
    const gegner = await seedTeam({ fussballdeTeamId: "fd-gegner-2" });
    await db
      .update(teams)
      .set({ logoUrl: "r2://bucket/teams/y/logo.png", discoverable: false })
      .where(eq(teams.id, gegner.id));

    expect(await getOpponentLogoUrl("fd-gegner-2")).toBeNull();
  });

  it("unbekannter Gegner / keine team-id → null", async () => {
    expect(await getOpponentLogoUrl("gibts-nicht")).toBeNull();
    expect(await getOpponentLogoUrl(null)).toBeNull();
  });
});
