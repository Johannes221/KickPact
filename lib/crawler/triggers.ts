export type MatchSide = "heim" | "gast";

export interface MatchEventInput {
  id: string;
  type: "tor" | "auswechslung" | "spezial" | "karte";
  subtype?: string | null;
  minute: number | null;
  side: MatchSide;
  playerName?: string | null;
  playerId?: string | null;
  source: "scraped" | "manual";
}

export interface MatchInput {
  id: string;
  teamSide: MatchSide;
  ergebnisHeim: number;
  ergebnisGast: number;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  events: MatchEventInput[];
}

export type TriggerType =
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
  | "special_goal"
  | "yellow_card"
  | "red_card"
  | "assist"
  | "man_of_match"
  | "custom";

export interface PledgeRuleInput {
  id: string;
  pledgeId: string;
  triggerType: TriggerType;
  triggerParams: Record<string, unknown>;
  amountCents: number;
  perMatchCapCents: number | null;
}

export interface ChargeProposal {
  pledgeId: string;
  pledgeRuleId: string;
  matchId: string;
  matchEventId: string | null;
  triggerType: TriggerType;
  amountCents: number;
  requiresApproval: boolean;
}

/**
 * Pure function. Gegeben ein Match + die für die gesponserte Mannschaft aktiven
 * Pledge-Rules, liefert die Liste der ChargeProposals zurück.
 * Respektiert per_match_cap pro Rule.
 * Monthly-Cap wird NICHT hier durchgesetzt (passiert downstream im evaluate-match Job
 * mit DB-Zugriff auf bisherige Charges des Monats).
 */
export function evaluateTriggers(
  match: MatchInput,
  rules: PledgeRuleInput[]
): ChargeProposal[] {
  throw new Error("not implemented");
}
