/**
 * Schmaler Simulations-Adapter für das Saison-Wrapped (W4).
 *
 * Kapselt das im Saison-Features-Plan (2026-06-12) definierte Interface
 * `simulateRulesOverMatches(matches, rules)` mit Result
 * `{ totalCents, perRule, monthsCovered, matchCount }`.
 *
 * TODO(nach Merge von W3): auf `simulateRulesOverMatches` aus
 * lib/simulation/pact-simulation.ts umstellen — diese Datei behält dann nur
 * die Typ-Weiterleitung. Bis dahin rechnet hier eine bewusst minimale eigene
 * Implementierung, die ausschließlich `goal_total` unterstützt (Tore × Betrag,
 * keine Caps). Das reicht für den Wrapped-Fallback-Slide
 * „Mit einem 1-€-pro-Tor-Pact wären das X € gewesen".
 */

export interface WrappedSimMatchInput {
  /** Auf welcher Seite die gesponserte Mannschaft stand. */
  teamSide: "heim" | "gast";
  ergebnisHeim: number;
  ergebnisGast: number;
  /** Spieldatum — nur für `monthsCovered` benötigt. */
  datum: Date;
}

export interface WrappedSimRuleInput {
  triggerType: string;
  amountCents: number;
}

export interface WrappedSimResult {
  totalCents: number;
  perRule: Array<{ triggerType: string; count: number; cents: number }>;
  /** Anzahl unterschiedlicher Kalendermonate mit mind. einem Spiel. */
  monthsCovered: number;
  matchCount: number;
}

export function simulateRulesOverMatches(
  matches: WrappedSimMatchInput[],
  rules: WrappedSimRuleInput[]
): WrappedSimResult {
  const months = new Set<string>();
  let totalOwnGoals = 0;
  for (const m of matches) {
    months.add(`${m.datum.getFullYear()}-${m.datum.getMonth()}`);
    totalOwnGoals += m.teamSide === "heim" ? m.ergebnisHeim : m.ergebnisGast;
  }

  const perRule: WrappedSimResult["perRule"] = [];
  let totalCents = 0;
  for (const r of rules) {
    // Mini-Implementierung: nur goal_total (siehe TODO oben).
    if (r.triggerType !== "goal_total") continue;
    const cents = totalOwnGoals * r.amountCents;
    perRule.push({ triggerType: r.triggerType, count: totalOwnGoals, cents });
    totalCents += cents;
  }

  return {
    totalCents,
    perRule,
    monthsCovered: months.size,
    matchCount: matches.length
  };
}
