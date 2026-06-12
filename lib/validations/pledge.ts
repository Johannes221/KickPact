import { z } from "zod";
import type { TriggerType as CanonicalTriggerType } from "@/lib/triggers/labels";

/**
 * Die im Pact-Wizard BEWETTBAREN Trigger — eine bewusste Teilmenge des
 * kanonischen Trigger-Enums (lib/triggers/labels.ts ↔ DB-Enum
 * lib/db/schema/pledges.ts). Nicht bewettbar (nur als Anzeige/Charge möglich):
 * loss, draw, custom.
 *
 * `special_goal`, `assist`, `man_of_match`, `yellow_card`, `red_card` sind
 * vom-Verein-gemeldete Spezialwetten (manual + requiresApproval); Spezialtore
 * werden über `params.subtype` (kopfball | hackentor | elfmeter | freistoss |
 * sonstiges) als einzelne Wetten ausgewiesen.
 */
export const TRIGGER_TYPES = [
  // pro Spiel — automatisch
  "goal_total",
  "win",
  "home_win",
  "away_win",
  "clean_sheet",
  "comeback_win",
  "hattrick",
  "goal_by_player",
  "goals_scored_min",
  "goal_diff_min",
  // pro Spiel — vom Verein gemeldet (manual)
  "special_goal",
  "assist",
  "man_of_match",
  "yellow_card",
  "red_card",
  // pro Saison
  "season_promotion",
  "season_no_relegation",
  "season_table_position",
  "season_champion",
  "season_cup_round",
  "season_custom"
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

/**
 * Compile-Time-Guard gegen Drift: jeder bewettbare Trigger MUSS ein gültiger
 * kanonischer Trigger-Typ sein. Tippfehler oder ein Trigger, der im DB-Enum
 * fehlt, bricht hier den Build. (Type-only — keine Runtime-/Bundle-Kosten.)
 */
const _triggerSubsetCheck: readonly CanonicalTriggerType[] = TRIGGER_TYPES;
void _triggerSubsetCheck;

/**
 * Saison-Trigger feuern 1× am Saison-Ende (gebunden an EIN Ergebnis) — daher
 * kein Perioden-Cap. Lokal definiert (statt Import aus dem DB-Schema), damit
 * dieses Modul client-bundle-frei von drizzle bleibt.
 */
const SEASON_TRIGGER_TYPES = new Set<string>([
  "season_promotion",
  "season_no_relegation",
  "season_table_position",
  "season_champion",
  "season_cup_round",
  "season_custom"
]);

export function isSeasonTriggerType(t: string): boolean {
  return SEASON_TRIGGER_TYPES.has(t);
}

export const CAP_PERIODS = ["month", "season"] as const;
export type CapPeriod = (typeof CAP_PERIODS)[number];

export const pledgeRuleInputSchema = z
  .object({
    triggerType: z.enum(TRIGGER_TYPES),
    amountEur: z.number().min(0.5).max(500),
    /** Optionaler Cap pro Wette, begrenzt pro `capPeriod`. Nicht bei Saison-Wetten. */
    capEur: z.number().positive().max(100000).optional(),
    capPeriod: z.enum(CAP_PERIODS).optional(),
    params: z.record(z.unknown()).default({})
  })
  .superRefine((val, ctx) => {
    if (SEASON_TRIGGER_TYPES.has(val.triggerType)) {
      if (val.capEur !== undefined || val.capPeriod !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Saison-Regeln können keinen Cap haben.",
          path: ["capEur"]
        });
      }
      return;
    }
    if (val.capEur !== undefined && val.capPeriod === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bitte Cap-Periode wählen (pro Monat oder pro Saison).",
        path: ["capPeriod"]
      });
    }

    // Audit 2026-06-11 / C1: Pflicht-Params pro Trigger-Typ (siehe
    // validateTriggerParams) — Fehler erscheint im Builder-Step der Regel.
    const paramError = validateTriggerParams(val.triggerType, val.params);
    if (paramError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: paramError,
        path: ["params"]
      });
    }
  });

/**
 * Audit 2026-06-11 / C1: Pflicht-Params pro Trigger-Typ. Ohne Schwellwert
 * feuerte goals_scored_min/goal_diff_min bei JEDEM Spiel (>= 0), ohne
 * Spielernamen feuerte goal_by_player nie (toter Pact). Beide Schreibweisen
 * lesen (Builder schreibt snake_case, Engine camelCase). Wird vom Zod-Schema
 * (Builder + createPledge) UND den Editor-Actions (addPledgeRule/
 * updatePledgeRule in lib/actions/pledges.ts) benutzt — eine Quelle.
 *
 * @returns deutsche Fehlermeldung oder null wenn ok.
 */
export function validateTriggerParams(
  triggerType: string,
  params: Record<string, unknown>
): string | null {
  if (triggerType === "goals_scored_min" || triggerType === "goal_diff_min") {
    const raw =
      triggerType === "goals_scored_min"
        ? (params.minGoals ?? params.min_goals)
        : (params.minDiff ?? params.min_diff);
    const threshold = typeof raw === "string" ? Number(raw) : raw;
    if (
      typeof threshold !== "number" ||
      !Number.isFinite(threshold) ||
      threshold < 1
    ) {
      return triggerType === "goals_scored_min"
        ? "Bitte Mindestanzahl Tore angeben (mindestens 1)."
        : "Bitte Mindest-Tordifferenz angeben (mindestens 1).";
    }
  }
  if (triggerType === "goal_by_player") {
    const name = (params.playerName ?? params.player_name) as string | undefined;
    const id = (params.playerId ?? params.player_id) as string | undefined;
    if ((!name || !name.trim()) && (!id || !id.trim())) {
      return "Bitte einen Spieler auswählen oder Namen eingeben.";
    }
  }
  return null;
}

export const pledgeInputSchema = z.object({
  invitationToken: z.string().min(1, "Einladungs-Token fehlt"),
  rules: z.array(pledgeRuleInputSchema).min(1, "Mindestens eine Regel"),
  // C1 (Audit 2026-06-11): muss > 0 sein — monthlyCapEur=0 hieß vorher
  // "Cap 0 €" und blockte still jede Charge des Pacts.
  monthlyCapEur: z
    .number()
    .positive("Das Monatslimit muss größer als 0 € sein.")
    .optional(),
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
  max_position: "maxPosition",
  min_round: "minRound"
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
