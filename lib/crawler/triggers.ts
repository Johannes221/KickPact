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
  const proposals: ChargeProposal[] = [];

  for (const r of rules) {
    const ruleProposals = evaluateRule(match, r);

    // Per-match-cap: emit charges in order, stop emitting once full charge would exceed cap.
    let emittedSum = 0;
    for (const p of ruleProposals) {
      const wouldExceed =
        r.perMatchCapCents !== null && emittedSum + p.amountCents > r.perMatchCapCents;
      if (wouldExceed) break;
      proposals.push(p);
      emittedSum += p.amountCents;
    }
  }

  return proposals;
}

function evaluateRule(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  switch (rule.triggerType) {
    case "goal_total":
      return goalTotal(match, rule);
    case "goal_by_player":
      return goalByPlayer(match, rule);
    default:
      return [];
  }
}

function ownGoals(match: MatchInput): MatchEventInput[] {
  return match.events.filter((e) => e.type === "tor" && e.side === match.teamSide);
}

function goalTotal(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  return ownGoals(match).map((event) => ({
    pledgeId: rule.pledgeId,
    pledgeRuleId: rule.id,
    matchId: match.id,
    matchEventId: event.id,
    triggerType: rule.triggerType,
    amountCents: rule.amountCents,
    requiresApproval: false
  }));
}

function goalByPlayer(match: MatchInput, rule: PledgeRuleInput): ChargeProposal[] {
  const targetId = rule.triggerParams.playerId as string | undefined;
  const targetName = rule.triggerParams.playerName as string | undefined;

  return ownGoals(match)
    .filter((e) => {
      if (targetId) return e.playerId === targetId;
      if (targetName) return e.playerName === targetName;
      return false;
    })
    .map((event) => ({
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      requiresApproval: false
    }));
}
