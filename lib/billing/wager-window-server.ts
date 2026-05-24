import "server-only";
import {
  getActiveSeasonForDate,
  type SeasonRow
} from "@/lib/db/queries/seasons";
import {
  canBookSeasonPassPure,
  canCreateSeasonWagerPure,
  type SeasonWindow
} from "./wager-window";

function toSeasonWindow(s: SeasonRow): SeasonWindow {
  return { id: s.id, code: s.code, matchdayFiveAt: s.matchdayFiveAt };
}

export async function getActiveSeason(today: Date): Promise<SeasonWindow | null> {
  const row = await getActiveSeasonForDate(today);
  return row ? toSeasonWindow(row) : null;
}

export async function canBookSeasonPass(
  seasonId: string,
  today: Date
): Promise<boolean> {
  const active = await getActiveSeason(today);
  if (!active || active.id !== seasonId) return false;
  return canBookSeasonPassPure(active, today);
}

export async function canCreateSeasonWager(
  seasonId: string,
  today: Date
): Promise<boolean> {
  const active = await getActiveSeason(today);
  if (!active || active.id !== seasonId) return false;
  return canCreateSeasonWagerPure(active, today);
}
