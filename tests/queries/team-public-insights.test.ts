import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, seasonResults } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { getPublicTeamInsights } from "@/lib/db/queries/team-public-insights";

async function seed(showInsights: boolean) {
  const clubName = "Sportfreunde Testkirchen";
  const [club] = await db.insert(clubs).values({ slug: `c-${createId().slice(0,6)}`, name: clubName, fussballdeVereinId: createId() }).returning({ id: clubs.id });
  const [team] = await db.insert(teams).values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true, showInsights }).returning({ id: teams.id, name: teams.name, saison: teams.saison });
  // heimName uses the club's identifying token ("Sportfreunde") so detectTeamSide works
  await db.insert(matches).values({ teamId: team.id, fussballdeSpielId: createId(), datum: new Date(), heimName: "Sportfreunde Testkirchen", gastName: "G", status: "finished", ergebnisHeim: 2, ergebnisGast: 0 });
  await db.insert(seasonResults).values({ teamId: team.id, saison: "2024/25", finalPosition: 2, promoted: true });
  return { teamId: team.id, teamName: team.name, clubName };
}

describe("getPublicTeamInsights", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("liefert null wenn show_insights=false", async () => {
    const s = await seed(false);
    expect(await getPublicTeamInsights(s.teamId, s.teamName, s.clubName)).toBeNull();
  });

  it("kombiniert laufende + letzte Saison", async () => {
    const s = await seed(true);
    const ins = await getPublicTeamInsights(s.teamId, s.teamName, s.clubName);
    expect(ins).not.toBeNull();
    expect(ins!.current.games).toBe(1);
    expect(ins!.current.wins).toBe(1);
    expect(ins!.lastSeason?.finalPosition).toBe(2);
    expect(ins!.lastSeason?.promoted).toBe(true);
  });
});
