import "server-only";
import {
  getActiveSeasonForDate,
  getSeasonByCode,
  getTeamSaison,
  type SeasonRow
} from "@/lib/db/queries/seasons";
import { type SeasonWindow } from "./wager-window";

function toSeasonWindow(s: SeasonRow): SeasonWindow {
  return { id: s.id, code: s.code, matchdayFiveAt: s.matchdayFiveAt };
}

export async function getActiveSeason(today: Date): Promise<SeasonWindow | null> {
  const row = await getActiveSeasonForDate(today);
  return row ? toSeasonWindow(row) : null;
}

/**
 * Saison-Wetten-Fenster der MANNSCHAFT (W1.2): maßgeblich ist `teams.saison`
 * (nach dem Sofort-Rollover "2627"), nicht das Kalenderdatum — sonst hinge das
 * Fenster im Juni am toten 25/26-Cutoff (15.9.2025) und Saison-Ziele für
 * 26/27 wären bis zum 1.7. gesperrt.
 *
 * Fallback (Team unbekannt / keine seasons-Row zum Code): getActiveSeason(now).
 */
export async function getSeasonWindowForTeam(
  teamId: string,
  today: Date
): Promise<SeasonWindow | null> {
  const saison = await getTeamSaison(teamId);
  if (saison) {
    const row = await getSeasonByCode(saison);
    if (row) return toSeasonWindow(row);
  }
  return getActiveSeason(today);
}
