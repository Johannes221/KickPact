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
    case "win":
      return outcome(match, rule, isWin);
    case "loss":
      return outcome(match, rule, isLoss);
    case "draw":
      return outcome(match, rule, isDraw);
    case "clean_sheet":
      return outcome(match, rule, isCleanSheet);
    case "comeback_win":
      return outcome(match, rule, isComebackWin);
    case "hattrick":
      return outcome(match, rule, isHattrick);
    case "goal_diff_min":
      return outcome(match, rule, (m) => {
        const minDiff = Number(rule.triggerParams.minDiff ?? 0);
        return isWin(m) && ownScore(m) - opponentScore(m) >= minDiff;
      });
    case "goals_scored_min":
      return outcome(match, rule, (m) => {
        const minGoals = Number(rule.triggerParams.minGoals ?? 0);
        return ownScore(m) >= minGoals;
      });
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

function ownScore(match: MatchInput): number {
  return match.teamSide === "heim" ? match.ergebnisHeim : match.ergebnisGast;
}

function opponentScore(match: MatchInput): number {
  return match.teamSide === "heim" ? match.ergebnisGast : match.ergebnisHeim;
}

function isWin(m: MatchInput): boolean {
  return ownScore(m) > opponentScore(m);
}

function isLoss(m: MatchInput): boolean {
  return ownScore(m) < opponentScore(m);
}

function isDraw(m: MatchInput): boolean {
  return ownScore(m) === opponentScore(m);
}

function isCleanSheet(m: MatchInput): boolean {
  return isWin(m) && opponentScore(m) === 0;
}

function outcome(
  match: MatchInput,
  rule: PledgeRuleInput,
  predicate: (m: MatchInput) => boolean
): ChargeProposal[] {
  if (!predicate(match)) return [];
  return [
    {
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: null,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      requiresApproval: false
    }
  ];
}

function ownHalftime(m: MatchInput): number | null {
  if (m.halbzeitHeim === null || m.halbzeitGast === null) return null;
  return m.teamSide === "heim" ? m.halbzeitHeim : m.halbzeitGast;
}

function opponentHalftime(m: MatchInput): number | null {
  if (m.halbzeitHeim === null || m.halbzeitGast === null) return null;
  return m.teamSide === "heim" ? m.halbzeitGast : m.halbzeitHeim;
}

function isComebackWin(m: MatchInput): boolean {
  if (!isWin(m)) return false;
  const ownHT = ownHalftime(m);
  const oppHT = opponentHalftime(m);
  if (ownHT === null || oppHT === null) return false;
  return ownHT < oppHT;
}

function isHattrick(m: MatchInput): boolean {
  const goalsByPlayer = new Map<string, number>();
  for (const e of m.events) {
    if (e.type !== "tor" || e.side !== m.teamSide) continue;
    const key = e.playerId ?? e.playerName ?? "unknown";
    goalsByPlayer.set(key, (goalsByPlayer.get(key) ?? 0) + 1);
  }
  for (const count of goalsByPlayer.values()) {
    if (count >= 3) return true;
  }
  return false;
}
