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
  | "custom"
  // Season-scoped triggers — evaluated once at the end of a season via
  // `evaluateSeasonTriggers`, never inside `evaluateTriggers`.
  | "season_promotion"
  | "season_no_relegation"
  | "season_table_position"
  | "season_champion"
  | "season_cup_round"
  | "season_custom";

export interface PledgeRuleInput {
  id: string;
  pledgeId: string;
  triggerType: TriggerType;
  triggerParams: Record<string, unknown>;
  amountCents: number;
  perMatchCapCents: number | null;
  /** Perioden-Cap-Betrag (Cent). Enforcement DB-aware in evaluate-match/recalc, nicht hier. */
  capCents?: number | null;
  /** Perioden-Cap-Fenster für `capCents`. */
  capPeriod?: "month" | "season" | null;
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
        // Defensiv beide Schreibweisen lesen, falls eine Row noch nicht durch
        // Migration 0039 auf camelCase normalisiert wurde.
        const minDiff = Number(rule.triggerParams.minDiff ?? rule.triggerParams.min_diff ?? 0);
        return isWin(m) && ownScore(m) - opponentScore(m) >= minDiff;
      });
    case "goals_scored_min":
      return outcome(match, rule, (m) => {
        const minGoals = Number(rule.triggerParams.minGoals ?? rule.triggerParams.min_goals ?? 0);
        return ownScore(m) >= minGoals;
      });
    case "special_goal":
      return manualEvents(match, rule, "spezial", rule.triggerParams.subtype as string | undefined);
    case "yellow_card":
      return manualEvents(match, rule, "karte", "gelb");
    case "red_card":
      return manualEvents(match, rule, "karte", "rot");
    case "assist":
      return manualEvents(match, rule, "spezial", "assist");
    case "man_of_match":
      return manualEvents(match, rule, "spezial", "man_of_match");
    case "custom":
      return manualEvents(match, rule, "spezial", rule.triggerParams.subtype as string | undefined);
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
  // Defensiv beide Schreibweisen lesen (camelCase canonical, snake_case Legacy).
  const targetId = (rule.triggerParams.playerId ?? rule.triggerParams.player_id) as
    | string
    | undefined;
  const targetName = (rule.triggerParams.playerName ?? rule.triggerParams.player_name) as
    | string
    | undefined;

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

function manualEvents(
  match: MatchInput,
  rule: PledgeRuleInput,
  type: MatchEventInput["type"],
  subtype: string | undefined
): ChargeProposal[] {
  return match.events
    .filter(
      (e) =>
        e.source === "manual" &&
        e.side === match.teamSide &&
        e.type === type &&
        (subtype === undefined || e.subtype === subtype)
    )
    .map((event) => ({
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      requiresApproval: true
    }));
}

// ---------------------------------------------------------------------------
// Season-scope triggers
// ---------------------------------------------------------------------------

/**
 * Snapshot of a team's end-of-season status, used to evaluate season-scoped
 * triggers (`season_promotion`, `season_champion`, etc.). Built by the
 * scraper from the final table + cup-result pages once a saison is over.
 */
export interface SeasonInput {
  teamId: string;
  saison: string;
  finalPosition: number;
  totalTeams: number;
  promoted: boolean;
  relegated: boolean;
  champion: boolean;
  /** Furthest cup round reached, or `null` if the team did not enter / was eliminated before recorded round. */
  cupRound: string | null;
}

/**
 * ChargeProposal variant for season-scoped triggers. `matchId` and
 * `matchEventId` are always `null`; an additional `saison` identifies the
 * season the charge belongs to.
 */
export interface SeasonChargeProposal {
  pledgeId: string;
  pledgeRuleId: string;
  matchId: null;
  matchEventId: null;
  triggerType: TriggerType;
  amountCents: number;
  requiresApproval: boolean;
  saison: string;
}

/**
 * Pure function. Given a team's end-of-season snapshot and the active
 * pledge-rules (season-scoped only), returns ChargeProposals to emit.
 *
 * Each season-rule fires at most once per `SeasonInput`. Non-season trigger
 * types are silently skipped — callers can pass a mixed rule list.
 *
 * `season_custom` is treated as approval-required (verein-defined milestones
 * the sponsor must confirm).
 */
export function evaluateSeasonTriggers(
  input: SeasonInput,
  rules: PledgeRuleInput[]
): SeasonChargeProposal[] {
  const out: SeasonChargeProposal[] = [];
  for (const r of rules) {
    let fires = false;
    switch (r.triggerType) {
      case "season_promotion":
        fires = input.promoted;
        break;
      case "season_no_relegation":
        fires = !input.relegated;
        break;
      case "season_table_position": {
        const maxPosition = Number(
          (r.triggerParams as { maxPosition?: number; max_position?: number }).maxPosition ??
            (r.triggerParams as { max_position?: number }).max_position ??
            0
        );
        fires = maxPosition > 0 && input.finalPosition <= maxPosition;
        break;
      }
      case "season_champion":
        fires = input.champion;
        break;
      case "season_cup_round": {
        const target =
          (r.triggerParams as { round?: string }).round ?? null;
        fires = target !== null && input.cupRound === target;
        break;
      }
      case "season_custom":
        // verein-declared milestone — always emit and require sponsor approval
        fires = true;
        break;
      default:
        // not a season-scope trigger — skip silently
        continue;
    }
    if (fires) {
      out.push({
        pledgeId: r.pledgeId,
        pledgeRuleId: r.id,
        matchId: null,
        matchEventId: null,
        triggerType: r.triggerType,
        amountCents: r.amountCents,
        requiresApproval: r.triggerType === "season_custom",
        saison: input.saison
      });
    }
  }
  return out;
}
