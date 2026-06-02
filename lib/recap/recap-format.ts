/**
 * Pure Formatierungs-Helfer für den Saison-Recap (Feature 3).
 * Kein DB-/Window-Import → unit-testbar.
 */

/** Ganze Euro mit Tausender-Punkt, z.B. 123456 → "1.235 €". */
export function eurWhole(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString("de-DE")} €`;
}

const TRIGGER_LABELS: Record<string, string> = {
  goal: "Tore",
  goal_total: "Tore",
  player_goal: "Spieler-Tore",
  win: "Siege",
  draw: "Unentschieden",
  loss: "Niederlagen",
  clean_sheet: "Zu-Null-Spiele",
  comeback: "Comebacks",
  hattrick: "Hattricks",
  goal_diff: "Tordifferenz",
  assist: "Vorlagen",
  yellow_card: "Gelbe Karten",
  red_card: "Rote Karten",
  special_goal: "Spezial-Tore",
  player_of_match: "Spieler des Spiels"
};

/** Menschenlesbares Label für einen Trigger-Typ (Fallback: entkapseltes Roh-Token). */
export function triggerLabel(type: string): string {
  return TRIGGER_LABELS[type] ?? type.replace(/_/g, " ");
}

/** "2025/26" oder "2526" → "Saison 25/26". Fallback: "Saison <input>". */
export function seasonLabel(saison: string | null | undefined): string {
  if (!saison) return "Saison";
  const slash = saison.match(/^(\d{4})\/(\d{2,4})$/);
  if (slash) return `Saison ${slash[1].slice(2)}/${slash[2].slice(-2)}`;
  const compact = saison.match(/^(\d{2})(\d{2})$/);
  if (compact) return `Saison ${compact[1]}/${compact[2]}`;
  return `Saison ${saison}`;
}
