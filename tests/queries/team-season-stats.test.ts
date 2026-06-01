import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { computeTeamSeasonStats } from "@/lib/db/queries/team-dashboard";

describe("computeTeamSeasonStats", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("zählt S/U/N + Tore korrekt (Heim/Auswärts)", async () => {
    // Vereinsname braucht mindestens ein Token mit ≥5 Zeichen, damit detectTeamSide
    // Heim/Auswärts korrekt erkennt (ROLE_WORDS + Längen-Filter in team-side.ts).
    const clubName = "Sportfreunde Testkirchen";
    const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
    const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true }).returning({ id: teams.id });
    // Heimsieg 3:1
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(), heimName: clubName, gastName: "Gegner A", status: "finished", ergebnisHeim: 3, ergebnisGast: 1 });
    // Auswärtsniederlage 0:2 (Team ist Gast)
    await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(), heimName: "Gegner B", gastName: clubName, status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });

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
});
