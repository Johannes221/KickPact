import "server-only";
import {
  getActiveSeasonForDate,
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
