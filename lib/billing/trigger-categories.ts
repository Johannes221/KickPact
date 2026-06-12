/**
 * Klassifikation der Trigger-Typen in 3 UI-Kategorien für die Finanzen-Page.
 *
 * - `auto`   — Per-Spiel, vom Fußball.de-Crawler automatisch erkannt.
 *              Sponsoren bekommen ihre Charges, ohne dass jemand etwas melden muss.
 * - `manual` — Per-Spiel, aber die Mannschaft muss das Ereignis melden
 *              (z.B. Hackentor, Spieler des Spiels, Custom-Event). Sponsor bestätigt.
 * - `season` — Saison-Wetten (Aufstieg, Klassenerhalt, Tabellenplatz, Pokal).
 *              Werden 1× am Saison-Ende ausgewertet.
 *
 * Synchron zu `lib/db/schema/pledges.ts` und `lib/triggers/labels.ts`.
 */

import { SEASON_TRIGGERS } from "@/lib/db/schema/pledges";
import type { TriggerType } from "@/lib/triggers/labels";
import { TRIGGER_META } from "@/lib/triggers/labels";

export type TriggerCategory = "auto" | "manual" | "season";

const MANUAL_MATCH_TRIGGERS = [
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom"
] as const;

/**
 * Maps a trigger-type-enum value to its UI category.
 *
 * Unknown trigger types fall back to "manual" — safe default because manual
 * triggers gate on approval and don't auto-charge.
 */
export function categorize(triggerType: string): TriggerCategory {
  if ((SEASON_TRIGGERS as readonly string[]).includes(triggerType)) {
    return "season";
  }
  if ((MANUAL_MATCH_TRIGGERS as readonly string[]).includes(triggerType)) {
    return "manual";
  }
  // Fallback: alles andere ist ein per-Spiel-Auto-Trigger (goal_total, win, ...).
  // Falls ein Trigger im TRIGGER_META aufgenommen wird, validieren wir das hier:
  const meta = (TRIGGER_META as Record<string, { auto: boolean; scope: string } | undefined>)[
    triggerType
  ];
  if (meta && meta.scope === "match" && meta.auto === false) {
    return "manual";
  }
  return "auto";
}

/**
 * Kurzes Kategorie-Label fürs KPI-Grid (Finanzen-Tab Kachel-Header).
 */
export function getCategoryLabelShort(category: TriggerCategory): string {
  switch (category) {
    case "auto":
      return "Auto-Trigger";
    case "manual":
      return "Manuelle Trigger";
    case "season":
      return "Saison-Ziele";
  }
}

/**
 * Ausführliches Kategorie-Label für Erklär-/Filter-Kontexte (beschreibt, was
 * die Kategorie bedeutet, statt sie nur zu benennen).
 */
export function getCategoryLabelLong(category: TriggerCategory): string {
  switch (category) {
    case "auto":
      return "Automatisch erfasst";
    case "manual":
      return "Manuell (Bestätigung nötig)";
    case "season":
      return "Saison-Ziele";
  }
}

/**
 * Statische Liste aller Trigger-Typen pro Kategorie, in der UI-Reihenfolge,
 * die auf der Finanzen-Page erscheinen soll. Wird beim Bauen des KPI-Grids
 * verwendet, damit auch Kacheln ohne Charges (Wert = 0 €) sichtbar bleiben.
 */
export const TRIGGER_TYPES_BY_CATEGORY: Record<TriggerCategory, TriggerType[]> = {
  auto: [
    "goal_total",
    "win",
    "home_win",
    "away_win",
    "clean_sheet",
    "comeback_win",
    "hattrick",
    "draw",
    "loss",
    "goal_by_player",
    "goal_diff_min",
    "goals_scored_min"
  ],
  manual: [
    "special_goal",
    "yellow_card",
    "red_card",
    "assist",
    "man_of_match",
    "custom"
  ],
  season: [
    "season_promotion",
    "season_no_relegation",
    "season_table_position",
    "season_champion",
    "season_cup_round",
    "season_custom"
  ]
};
