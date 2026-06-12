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
  // W2 (Saison-Features 2026-06-12): Sieg nach Spielort — eigene Typen mit
  // eigenen Beträgen (Auswärtssiege dürfen mehr zählen).
  | "home_win"
  | "away_win"
  | "special_goal"
  | "yellow_card"
  | "red_card"
  | "assist"
  | "man_of_match"
  | "custom"
  // Season-scoped triggers — evaluated once at the end of a season via
  // `isTriggerHit` (lib/inngest/functions/evaluate-season.ts), never inside
  // `evaluateTriggers`.
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
  /**
   * 1-basierte Tor-Nummer für event-lose Tor-Charges (results_only).
   * Unterscheidet die n „pro Tor"-Charges eines Spiels im Unique-Index
   * charges_unique_match_trigger_idx — ohne Diskriminator kollabierten sie
   * auf eine einzige Charge. Fehlt/0 bei allen anderen Charge-Arten.
   */
  goalIndex?: number;
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
    case "home_win":
      // W2: Sieg UND Heimspiel. requiresApproval wie `win` (Outcome aus dem
      // offiziellen Endstand, kein Approval — Coverage-Policy K2 greift
      // downstream in evaluate-match).
      return outcome(match, rule, (m) => isWin(m) && m.teamSide === "heim");
    case "away_win":
      // W2: Sieg UND Auswärtsspiel — analog home_win.
      return outcome(match, rule, (m) => isWin(m) && m.teamSide === "gast");
    case "loss":
      return outcome(match, rule, isLoss);
    case "draw":
      return outcome(match, rule, isDraw);
    case "clean_sheet":
      return outcome(match, rule, isCleanSheet);
    case "comeback_win":
      // C3 (Audit 2026-06-11): manuelle Tor-Evidenz ⇒ Sponsor-Approval.
      return outcome(match, rule, isComebackWin, {
        requiresApproval: hasManualGoalEvidence(match, false)
      });
    case "hattrick":
      return outcome(match, rule, isHattrick, {
        requiresApproval: hasManualGoalEvidence(match, true)
      });
    case "goal_diff_min":
      return outcome(match, rule, (m) => {
        // Defensiv beide Schreibweisen lesen, falls eine Row noch nicht durch
        // Migration 0039 auf camelCase normalisiert wurde.
        // C1 (Audit 2026-06-11): fehlender/ungültiger Schwellwert ⇒ Regel
        // feuert NICHT. Vorher Default 0 ⇒ feuerte bei jedem Sieg.
        const minDiff = Number(rule.triggerParams.minDiff ?? rule.triggerParams.min_diff);
        if (!Number.isFinite(minDiff) || minDiff < 1) return false;
        return isWin(m) && ownScore(m) - opponentScore(m) >= minDiff;
      });
    case "goals_scored_min":
      return outcome(match, rule, (m) => {
        // C1: fehlender Schwellwert ⇒ feuert NICHT (vorher >= 0 ⇒ immer).
        const minGoals = Number(rule.triggerParams.minGoals ?? rule.triggerParams.min_goals);
        if (!Number.isFinite(minGoals) || minGoals < 1) return false;
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
  let events = ownGoals(match);

  // Audit 2026-06-11 / B7: Phantom-Tor-Deckel. Es zählen maximal
  // min(#Events, offizieller Score) Tore — mehr Events als der Endstand
  // hergibt (z.B. manuelle Doppel-Einträge vor einer Score-Korrektur)
  // erzeugen keine zusätzlichen Charges. Beim Deckeln haben gescrapte
  // Events Vorrang (fussball.de ist die Wahrheit), danach Minute/ID als
  // deterministischer Tiebreak.
  const officialScore = ownScore(match);
  if (events.length > officialScore) {
    events = [...events]
      .sort((a, b) => {
        if (a.source !== b.source) return a.source === "scraped" ? -1 : 1;
        if ((a.minute ?? 0) !== (b.minute ?? 0)) {
          return (a.minute ?? 0) - (b.minute ?? 0);
        }
        return a.id.localeCompare(b.id);
      })
      .slice(0, officialScore);
  }

  // Liegen Tor-Events vor (voller Spielbericht), zählt jedes Event einzeln — wie
  // bisher, inkl. der C1-Approval-Logik je Quelle. Unverändertes Verhalten.
  if (events.length > 0) {
    return events.map((event) => ({
      pledgeId: rule.pledgeId,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: rule.triggerType,
      amountCents: rule.amountCents,
      // SECURITY (C1): scraped goals are billed automatically (fussball.de is the
      // source of truth), but a *manually* reported goal must be confirmed by the
      // sponsor — otherwise a club could inject fake goals to inflate charges.
      requiresApproval: event.source === "manual"
    }));
  }

  // KEINE Tor-Events, aber echter Endstand → „nur Ergebnis"-Mannschaft
  // (results_only: fußball.de liefert den Score ohne Spielbericht). „Pro Tor"
  // muss trotzdem feuern: ownScore-mal als anonyme Auto-Charge (matchEventId
  // null). Offizieller Endstand ist die Quelle → keine Sponsor-Freigabe nötig.
  const score = ownScore(match);
  return Array.from({ length: score }, (_, i) => ({
    pledgeId: rule.pledgeId,
    pledgeRuleId: rule.id,
    matchId: match.id,
    matchEventId: null,
    triggerType: rule.triggerType,
    amountCents: rule.amountCents,
    requiresApproval: false,
    goalIndex: i + 1
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
      // SECURITY (C1): manual goals require sponsor approval (see goalTotal).
      requiresApproval: event.source === "manual"
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
  predicate: (m: MatchInput) => boolean,
  opts: { requiresApproval?: boolean } = {}
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
      requiresApproval: opts.requiresApproval ?? false
    }
  ];
}

/**
 * Audit 2026-06-11 / C3: Liegt mindestens ein BEITRAGENDES manuelles Tor-Event
 * vor, ist die Evidenz für hattrick/comeback_win nicht mehr rein gescrapte —
 * ein Verein könnte sich den Outcome über fingierte manuelle Tore zusammen-
 * bauen. Solche Proposals brauchen Sponsor-Bestätigung (Auto-Confirm bleibt
 * für rein gescrapte Evidenz). `ownOnly`: Hattrick zählt nur eigene Tore;
 * Comeback hängt an der Chronologie BEIDER Seiten.
 */
function hasManualGoalEvidence(m: MatchInput, ownOnly: boolean): boolean {
  return m.events.some(
    (e) =>
      e.type === "tor" &&
      e.source === "manual" &&
      (!ownOnly || e.side === m.teamSide)
  );
}

function ownHalftime(m: MatchInput): number | null {
  if (m.halbzeitHeim === null || m.halbzeitGast === null) return null;
  return m.teamSide === "heim" ? m.halbzeitHeim : m.halbzeitGast;
}

function opponentHalftime(m: MatchInput): number | null {
  if (m.halbzeitHeim === null || m.halbzeitGast === null) return null;
  return m.teamSide === "heim" ? m.halbzeitGast : m.halbzeitHeim;
}

/**
 * Comeback = die Mannschaft lag *irgendwann im Spielverlauf* hinten und gewinnt
 * am Ende. Bewusst NICHT halbzeit-basiert: ein Team kann auch erst in der
 * zweiten Hälfte in Rückstand geraten und drehen.
 *
 * Primärsignal ist die Tor-Chronologie (Minute für Minute): Wir führen den
 * laufenden Spielstand mit und prüfen, ob `ownScore < opponentScore` jemals
 * eintrat. Als kostenloses Sicherheitsnetz (gleiche Richtung) zählt zusätzlich
 * ein Halbzeit-Rückstand als „war hinten" — falls für ein Spiel ausnahmsweise
 * keine verwertbaren Tor-Minuten vorliegen.
 */
function isComebackWin(m: MatchInput): boolean {
  if (!isWin(m)) return false;
  return wasEverBehind(m);
}

function wasEverBehind(m: MatchInput): boolean {
  // Tor-Events chronologisch — stabil sortiert, Tore ohne Minute hinten.
  const goals = m.events
    .filter((e) => e.type === "tor")
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ma = a.e.minute ?? Number.POSITIVE_INFINITY;
      const mb = b.e.minute ?? Number.POSITIVE_INFINITY;
      return ma === mb ? a.i - b.i : ma - mb;
    });

  let own = 0;
  let opp = 0;
  for (const { e } of goals) {
    if (e.side === m.teamSide) own++;
    else opp++;
    if (own < opp) return true;
  }

  // Sicherheitsnetz: Halbzeit-Rückstand zählt ebenfalls als „war hinten".
  const ownHT = ownHalftime(m);
  const oppHT = opponentHalftime(m);
  if (ownHT !== null && oppHT !== null && ownHT < oppHT) return true;

  return false;
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
// Season-scope triggers: produktiv ist ausschließlich `isTriggerHit` in
// lib/inngest/functions/evaluate-season.ts. Die frühere Parallel-Engine
// `evaluateSeasonTriggers` (nie von Produktiv-Code aufgerufen, mit teils
// ABWEICHENDER Semantik — z.B. season_no_relegation ohne evaluatedAt-Guard)
// wurde im Audit 2026-06-11 / C5 wegen Verwechslungsgefahr entfernt.
// ---------------------------------------------------------------------------
