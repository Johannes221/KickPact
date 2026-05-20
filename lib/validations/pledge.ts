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
