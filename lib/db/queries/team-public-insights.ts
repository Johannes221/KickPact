import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, seasonResults } from "@/lib/db/schema";
import { computeTeamSeasonStats, type TeamSeasonStats } from "./team-dashboard";

export interface PublicTeamInsights {
  current: TeamSeasonStats;
  lastSeason: {
    saison: string;
    finalPosition: number | null;
    teamsInLeague: number | null;
    promoted: boolean;
    relegated: boolean;
  } | null;
}

/**
 * Insights fürs öffentliche Profil. `null`, wenn die Mannschaft Insights
 * ausgeblendet hat (`teams.show_insights=false`).
 *
 * „Letzte Saison": jüngste season_results-Zeile ≠ aktuelle Saison. Das
 * saison-Format weicht zwischen Tabellen ab ("2526" vs. "2024/25"), daher
 * NICHT per Gleichheit, sondern per ORDER BY saison DESC + Ausschluss der
 * aktuellen Team-Saison.
 */
export async function getPublicTeamInsights(
  teamId: string, teamName: string, clubName: string
): Promise<PublicTeamInsights | null> {
  const [t] = await db
    .select({ showInsights: teams.showInsights, saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!t || !t.showInsights) return null;

  const current = await computeTeamSeasonStats(teamId, teamName, clubName);

  const [last] = await db
    .select({
      saison: seasonResults.saison,
      finalPosition: seasonResults.finalPosition,
      teamsInLeague: seasonResults.teamsInLeague,
      promoted: seasonResults.promoted,
      relegated: seasonResults.relegated
    })
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, teamId), ne(seasonResults.saison, t.saison)))
    .orderBy(desc(seasonResults.saison))
    .limit(1);

  return { current, lastSeason: last ?? null };
}
