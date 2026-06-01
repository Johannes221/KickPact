import { z } from "zod";

export const TRIGGER_TYPES = [
  // pro Spiel
  "goal_total",
  "win",
  "clean_sheet",
  "comeback_win",
  "hattrick",
  "goal_by_player",
  "special_goal",
  "goals_scored_min",
  "goal_diff_min",
  // pro Saison
  "season_promotion",
  "season_no_relegation",
  "season_table_position",
  "season_champion",
  "season_cup_round",
  "season_custom"
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const pledgeRuleInputSchema = z.object({
  triggerType: z.enum(TRIGGER_TYPES),
  amountEur: z.number().min(0.5).max(500),
  perMatchCapEur: z.number().optional(),
  params: z.record(z.unknown()).default({})
});

export const pledgeInputSchema = z.object({
  invitationToken: z.string().min(1, "Einladungs-Token fehlt"),
  rules: z.array(pledgeRuleInputSchema).min(1, "Mindestens eine Regel"),
  monthlyCapEur: z.number().optional(),
  endsAtSaisonEnd: z.boolean().default(true)
});

export type PledgeInput = z.infer<typeof pledgeInputSchema>;
export type PledgeRuleInput = z.infer<typeof pledgeRuleInputSchema>;

/**
 * Kanonische camelCase-Keys für `trigger_params_json`.
 *
 * Der Pledge-Builder (UI) schrieb historisch snake_case (`min_goals`, `min_diff`,
 * `player_name`, `min_pos`/`max_pos`), während die Trigger-Engine
 * (`lib/crawler/triggers.ts`) camelCase liest (`minGoals`, `minDiff`,
 * `playerName`, `maxPosition`). Dadurch wurden Schwellwerte als 0 gelesen →
 * `goals_scored_min`/`goal_diff_min` feuerten immer, `goal_by_player` nie.
 *
 * Diese Map normalisiert beim Speichern auf die Engine-Keys. Unbekannte Keys
 * bleiben unverändert. Die Engine liest zusätzlich defensiv beide Schreibweisen,
 * damit bereits gespeicherte snake_case-Rows weiterhin korrekt auslösen.
 */
const TRIGGER_PARAM_KEY_MAP: Record<string, string> = {
  min_goals: "minGoals",
  min_diff: "minDiff",
  player_name: "playerName",
  player_id: "playerId",
  min_pos: "minPosition",
  max_pos: "maxPosition",
  max_position: "maxPosition"
};

export function normalizeTriggerParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[TRIGGER_PARAM_KEY_MAP[key] ?? key] = value;
  }
  return out;
}
