/**
 * Master-Liste aller Trigger-Typen mit lesbaren Labels.
 * Wird in Invoice-PDF, Match-Detail-Page, Pledge-Builder gebraucht.
 *
 * Synchron zu lib/db/schema/pledges.ts triggerTypeEnum.
 */
export type TriggerType =
  // per-match auto
  | "goal_total"
  | "goal_by_player"
  | "win"
  | "loss"
  | "draw"
  | "clean_sheet"
  | "comeback_win"
  | "hattrick"
  | "goal_diff_min"
  | "goals_scored_min"
  | "home_win"
  | "away_win"
  // per-match manual
  | "special_goal"
  | "yellow_card"
  | "red_card"
  | "assist"
  | "man_of_match"
  | "custom"
  // per-season
  | "season_promotion"
  | "season_no_relegation"
  | "season_table_position"
  | "season_champion"
  | "season_cup_round"
  | "season_custom";

export interface TriggerMeta {
  label: string;
  emoji: string;
  /** "match" = pro Spiel, "season" = pro Saison */
  scope: "match" | "season";
  /** Wird automatisch vom Crawler erkannt oder muss gemeldet werden? */
  auto: boolean;
}

export const TRIGGER_META: Record<TriggerType, TriggerMeta> = {
  goal_total: { label: "Pro Tor", emoji: "⚽", scope: "match", auto: true },
  goal_by_player: { label: "Tor von Spieler", emoji: "💚", scope: "match", auto: true },
  win: { label: "Pro Sieg", emoji: "🏆", scope: "match", auto: true },
  loss: { label: "Pro Niederlage", emoji: "😬", scope: "match", auto: true },
  draw: { label: "Pro Unentschieden", emoji: "🤝", scope: "match", auto: true },
  clean_sheet: { label: "Pro Zu-Null-Sieg", emoji: "🛡️", scope: "match", auto: true },
  comeback_win: { label: "Pro Comeback", emoji: "🔥", scope: "match", auto: true },
  hattrick: { label: "Pro Hattrick", emoji: "🎯", scope: "match", auto: true },
  goal_diff_min: { label: "Hoher Sieg", emoji: "📈", scope: "match", auto: true },
  goals_scored_min: { label: "Viele Tore", emoji: "🚀", scope: "match", auto: true },
  home_win: { label: "Pro Heimsieg", emoji: "🏠", scope: "match", auto: true },
  away_win: { label: "Pro Auswärtssieg", emoji: "🚌", scope: "match", auto: true },
  special_goal: { label: "Spezial-Tor", emoji: "🎭", scope: "match", auto: false },
  yellow_card: { label: "Gelbe Karte", emoji: "🟨", scope: "match", auto: false },
  red_card: { label: "Rote Karte", emoji: "🟥", scope: "match", auto: false },
  assist: { label: "Assist", emoji: "🅰️", scope: "match", auto: false },
  man_of_match: { label: "Spieler des Spiels", emoji: "⭐", scope: "match", auto: false },
  custom: { label: "Custom-Event", emoji: "💎", scope: "match", auto: false },
  season_promotion: { label: "Aufstieg", emoji: "⬆️", scope: "season", auto: true },
  season_no_relegation: { label: "Klassenerhalt", emoji: "🛟", scope: "season", auto: true },
  season_table_position: { label: "Tabellenplatz-Range", emoji: "🥇", scope: "season", auto: true },
  season_champion: { label: "Meister", emoji: "👑", scope: "season", auto: true },
  season_cup_round: { label: "Pokal-Runde", emoji: "🏆", scope: "season", auto: false },
  season_custom: { label: "Saison-Custom-Ziel", emoji: "🎺", scope: "season", auto: false }
};

/**
 * Statisches Pledge-Kontext-Label ("Pro Sieg", "Pro Tor") ohne Parameter.
 * Für PARAMETER-bewusste Ereignis-Labels ("Sieg von Max", "Tordifferenz ≥ 3")
 * siehe `getTriggerLabel` in `lib/billing/trigger-labels.ts` — bewusst eigenes
 * Vokabular, kein Duplikat.
 */
export function triggerLabel(t: string): string {
  return (TRIGGER_META as Record<string, TriggerMeta | undefined>)[t]?.label ?? t;
}

export function triggerEmoji(t: string): string {
  return (TRIGGER_META as Record<string, TriggerMeta | undefined>)[t]?.emoji ?? "💚";
}
