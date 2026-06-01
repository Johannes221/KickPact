/**
 * Trigger-Type → deutsche UI-Labels + Kategorie-Mapping.
 *
 * Single source of truth für die Trigger-Bezeichnungen, die ein Sponsor
 * im Pact-Wizard wählt und ein Trainer im Team-Dashboard sieht. Keine
 * DB-Abhängigkeit — pure Lookup-Tabellen.
 */

export type TriggerCategory = "auto" | "manual" | "season";

/**
 * Liefert eine kurze, deutsche Bezeichnung für einen Trigger-Typ.
 * Bei goal_by_player wird optional der Spielername eingewoben.
 */
export function getTriggerLabel(
  triggerType: string,
  params?: Record<string, unknown> | null
): string {
  switch (triggerType) {
    case "goal_total":
      return "Pro Tor";
    case "goal_by_player": {
      const name = stringParam(params, "playerName", "player_name");
      return name ? `Tor von ${name}` : "Pro Tor (Spieler)";
    }
    case "win":
      return "Sieg";
    case "loss":
      return "Niederlage";
    case "draw":
      return "Unentschieden";
    case "clean_sheet":
      return "Sauberer Sieg";
    case "comeback_win":
      return "Comeback-Sieg";
    case "hattrick":
      return "Hattrick";
    case "goal_diff_min": {
      const min = numericParam(params, "minDiff", "min_diff");
      return min ? `Tordifferenz ≥ ${min}` : "Tordifferenz";
    }
    case "goals_scored_min": {
      const min = numericParam(params, "minGoals", "min_goals");
      return min ? `≥ ${min} Tore` : "Mehrere Tore";
    }
    case "special_goal": {
      const subtype =
        params && typeof params.subtype === "string" ? params.subtype : null;
      const subtypeLabel = subtype ? SPECIAL_GOAL_LABELS[subtype] : null;
      return subtypeLabel ?? "Spezialtor";
    }
    case "yellow_card":
      return "Gelbe Karte";
    case "red_card":
      return "Rote Karte";
    case "assist":
      return "Assist";
    case "man_of_match":
      return "Spieler des Spiels";
    case "custom":
      return "Custom-Ereignis";
    case "season_promotion":
      return "Saison-Aufstieg";
    case "season_no_relegation":
      return "Klassenerhalt";
    case "season_table_position":
      return "Tabellenplatz";
    case "season_champion":
      return "Meisterschaft";
    case "season_cup_round":
      return "Pokal-Erfolg";
    case "season_custom":
      return "Saison-Ziel";
    default:
      return triggerType;
  }
}

/**
 * Liest einen numerischen Param und toleriert dabei sowohl die canonical
 * camelCase- als auch die Legacy-snake_case-Schreibweise (nicht-migrierte Rows).
 */
function numericParam(
  params: Record<string, unknown> | null | undefined,
  camel: string,
  snake: string
): number | null {
  if (!params) return null;
  for (const k of [camel, snake]) {
    if (typeof params[k] === "number") return params[k] as number;
  }
  return null;
}

/** Wie {@link numericParam}, aber für String-Params. */
function stringParam(
  params: Record<string, unknown> | null | undefined,
  camel: string,
  snake: string
): string | null {
  if (!params) return null;
  for (const k of [camel, snake]) {
    if (typeof params[k] === "string" && params[k]) return params[k] as string;
  }
  return null;
}

const SPECIAL_GOAL_LABELS: Record<string, string> = {
  kopfball: "Kopfballtor",
  hackentor: "Hackentor",
  volley: "Volleytor",
  fernschuss: "Fernschuss",
  elfmeter: "Elfmeter",
  freistoss: "Freistoßtor"
};

/**
 * Klassifiziert einen Trigger-Type in eine UI-Kategorie. Treibt die
 * Gruppierung im Finanzen-Dashboard und die Filter-Auswahl im Pacts-Tab.
 */
export function categorizeTrigger(triggerType: string): TriggerCategory {
  if (triggerType.startsWith("season_")) return "season";
  if (MANUAL_TRIGGERS.has(triggerType)) return "manual";
  return "auto";
}

const MANUAL_TRIGGERS = new Set([
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom"
]);

export function getCategoryLabel(category: TriggerCategory): string {
  switch (category) {
    case "auto":
      return "Automatisch erfasst";
    case "manual":
      return "Manuell (Bestätigung nötig)";
    case "season":
      return "Saison-Wetten";
  }
}
