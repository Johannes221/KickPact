/**
 * W3 (Saison-Features 2026-06-12) — DB-Wrapper der Geld-Simulation.
 *
 * `simulateForTeamSeason` lädt finished-Matches + Events des Saison-Fensters
 * [1.7. Startjahr, 1.7. Folgejahr), bestimmt teamSide via detectTeamSide
 * (Team- + Vereinsname, wie evaluate-match) und ruft den puren Kern.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { simulateForTeamSeason } from "@/lib/db/queries/simulation";

const CLUB_NAME = "Sportfreunde Testkirchen";

async function seedTeam(saison = "2627") {
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

async function seedMatch(
  teamId: string,
  m: {
    datum: string;
    heim: string;
    gast: string;
    eh?: number | null;
    eg?: number | null;
    status?: "finished" | "scheduled";
    /** Tor-Events: Seite + Minute. */
    tore?: { side: "heim" | "gast"; minute: number }[];
  }
) {
  const [row] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: createId(),
      datum: new Date(`${m.datum}T15:00:00`),
      heimName: m.heim,
      gastName: m.gast,
      ergebnisHeim: m.eh ?? null,
      ergebnisGast: m.eg ?? null,
      status: m.status ?? "finished"
    })
    .returning({ id: matches.id });
  for (const t of m.tore ?? []) {
    await db.insert(matchEvents).values({
      matchId: row.id,
      type: "tor",
      side: t.side,
      minute: t.minute,
      source: "scraped"
    });
  }
  return row.id;
}

describe("simulateForTeamSeason (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("simuliert die Vorsaison einer 26/27-Mannschaft über Heim-/Auswärts-Spiele", async () => {
    const teamId = await seedTeam("2627");

    // Heimsieg 3:1 mit vollem Spielbericht (3 eigene Tor-Events).
    await seedMatch(teamId, {
      datum: "2025-09-14",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      eh: 3,
      eg: 1,
      tore: [
        { side: "heim", minute: 12 },
        { side: "heim", minute: 44 },
        { side: "gast", minute: 60 },
        { side: "heim", minute: 78 }
      ]
    });
    // Auswärtssieg 0:2 ohne Events (results_only → 2 Endstand-Tore).
    await seedMatch(teamId, {
      datum: "2025-10-05",
      heim: "SV Gegner",
      gast: CLUB_NAME,
      eh: 0,
      eg: 2
    });
    // Geplantes Spiel + Spiel außerhalb des Fensters → ignoriert.
    await seedMatch(teamId, {
      datum: "2026-05-01",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      status: "scheduled"
    });
    await seedMatch(teamId, {
      datum: "2026-08-01",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      eh: 9,
      eg: 0
    });

    const result = await simulateForTeamSeason(teamId, "2526", [
      { id: "r1", triggerType: "goal_total", amountCents: 100 },
      { id: "r2", triggerType: "win", amountCents: 500 },
      { id: "r3", triggerType: "home_win", amountCents: 200 },
      { id: "r4", triggerType: "away_win", amountCents: 300 },
      { id: "r5", triggerType: "season_promotion", amountCents: 99900 }
    ]);

    expect(result).not.toBeNull();
    const byType = Object.fromEntries(result!.perRule.map((p) => [p.triggerType, p]));
    expect(byType.goal_total).toMatchObject({ count: 5, cents: 500 }); // 3 Events + 2 Endstand
    expect(byType.win).toMatchObject({ count: 2, cents: 1000 });
    expect(byType.home_win).toMatchObject({ count: 1, cents: 200 });
    expect(byType.away_win).toMatchObject({ count: 1, cents: 300 });
    expect(result!.totalCents).toBe(2000);
    expect(result!.matchCount).toBe(2);
    expect(result!.monthsCovered).toBe(2);
    expect(result!.excludedSeasonRules).toEqual(["season_promotion"]);
  });

  it("liefert ein Null-Ergebnis ohne Vorsaison-Spiele", async () => {
    const teamId = await seedTeam("2627");
    const result = await simulateForTeamSeason(teamId, "2526", [
      { id: "r1", triggerType: "win", amountCents: 500 }
    ]);
    expect(result).toMatchObject({ totalCents: 0, matchCount: 0 });
  });

  it("liefert null für unbekanntes Team oder kaputten Saison-Code", async () => {
    await expect(
      simulateForTeamSeason("gibt-es-nicht", "2526", [])
    ).resolves.toBeNull();
    const teamId = await seedTeam("2627");
    await expect(simulateForTeamSeason(teamId, "kaputt", [])).resolves.toBeNull();
  });
});
