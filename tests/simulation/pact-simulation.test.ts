/**
 * W3 (Saison-Features 2026-06-12) — Kern der Geld-Simulation.
 *
 * `simulateRulesOverMatches` läuft die ECHTE Trigger-Engine (`evaluateTriggers`)
 * pro Spiel über historische Matches und summiert deterministisch. Caps werden
 * als vereinfachte, dokumentierte Nachbildung angewendet (perMatch via Engine,
 * Rule-Cap month/season, Pledge-Monats-Cap). Saison-Regeln werden exkludiert
 * und im Result ausgewiesen.
 */
import { describe, expect, it } from "vitest";
import {
  simulateRulesOverMatches,
  type SimMatch,
  type SimRule
} from "@/lib/simulation/pact-simulation";

let matchSeq = 0;

function mkMatch(overrides: Partial<SimMatch> & { datum: string }): SimMatch {
  return {
    id: `m_${++matchSeq}`,
    teamSide: "heim",
    ergebnisHeim: 0,
    ergebnisGast: 0,
    halbzeitHeim: null,
    halbzeitGast: null,
    events: [],
    ...overrides,
    datum: new Date(`${overrides.datum}T14:00:00`)
  };
}

function goalEvent(id: string, minute: number, side: "heim" | "gast") {
  return {
    id,
    type: "tor" as const,
    subtype: null,
    minute,
    side,
    playerName: null,
    playerId: null,
    source: "scraped" as const
  };
}

function mkRule(overrides: Partial<SimRule> & { triggerType: string }): SimRule {
  return {
    id: `r_${overrides.triggerType}`,
    amountCents: 100,
    ...overrides
  };
}

/**
 * Fixture-Saison (3 Spiele + 1 Sep-Spiel on demand):
 * - M1 10.08. heim 3:1 — Comeback (0:1 hinten, dann 3 eigene Tore), Heimsieg.
 * - M2 24.08. gast 0:2 — Auswärtssieg, results_only (keine Events, nur Endstand).
 * - M3 07.09. heim 0:0 — Unentschieden (torlos, damit goal_total sauber zählt).
 */
function fixtureMatches(): SimMatch[] {
  return [
    mkMatch({
      datum: "2025-08-10",
      teamSide: "heim",
      ergebnisHeim: 3,
      ergebnisGast: 1,
      events: [
        goalEvent("g_opp", 10, "gast"),
        goalEvent("g1", 20, "heim"),
        goalEvent("g2", 55, "heim"),
        goalEvent("g3", 80, "heim")
      ]
    }),
    mkMatch({ datum: "2025-08-24", teamSide: "gast", ergebnisHeim: 0, ergebnisGast: 2 }),
    mkMatch({ datum: "2025-09-07", teamSide: "heim", ergebnisHeim: 0, ergebnisGast: 0 })
  ];
}

describe("simulateRulesOverMatches — Zählung", () => {
  it("zählt Tore (Events + results_only), Siege, Comebacks, Heim-/Auswärtssiege", () => {
    const result = simulateRulesOverMatches(fixtureMatches(), [
      mkRule({ triggerType: "goal_total", amountCents: 100 }),
      mkRule({ triggerType: "win", amountCents: 500 }),
      mkRule({ triggerType: "comeback_win", amountCents: 1000 }),
      mkRule({ triggerType: "home_win", amountCents: 200 }),
      mkRule({ triggerType: "away_win", amountCents: 300 })
    ]);

    // Tore: 3 Event-Tore (M1) + 2 Endstand-Tore (M2, results_only) = 5 × 1 €.
    const byType = Object.fromEntries(result.perRule.map((p) => [p.triggerType, p]));
    expect(byType.goal_total).toMatchObject({ count: 5, cents: 500 });
    expect(byType.win).toMatchObject({ count: 2, cents: 1000 });
    expect(byType.comeback_win).toMatchObject({ count: 1, cents: 1000 });
    expect(byType.home_win).toMatchObject({ count: 1, cents: 200 });
    expect(byType.away_win).toMatchObject({ count: 1, cents: 300 });

    expect(result.totalCents).toBe(3000);
    expect(result.matchCount).toBe(3);
    expect(result.monthsCovered).toBe(2); // Aug + Sep
    expect(result.excludedSeasonRules).toEqual([]);
  });

  it("leerer Spielplan → Null-Ergebnis", () => {
    const result = simulateRulesOverMatches([], [mkRule({ triggerType: "win" })]);
    expect(result).toMatchObject({ totalCents: 0, matchCount: 0, monthsCovered: 0 });
    expect(result.perRule).toEqual([]);
  });
});

describe("simulateRulesOverMatches — Caps", () => {
  it("perMatchCapCents wird pro Spiel respektiert (Engine-Verhalten)", () => {
    const result = simulateRulesOverMatches(fixtureMatches(), [
      mkRule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 250 })
    ]);
    // M1: 3 Tore, aber 100+100(+100>250) → 2; M2: 2 Tore = 200 ≤ 250 → 2.
    expect(result.totalCents).toBe(400);
  });

  it("Rule-Cap mit capPeriod=month gilt pro Kalendermonat des Spieldatums", () => {
    const matches = [
      ...fixtureMatches(),
      // Sep-Spiel mit 2 Endstand-Toren → frischer Monats-Bucket.
      mkMatch({ datum: "2025-09-21", teamSide: "heim", ergebnisHeim: 2, ergebnisGast: 0 })
    ];
    const result = simulateRulesOverMatches(matches, [
      mkRule({
        triggerType: "goal_total",
        amountCents: 100,
        capCents: 150,
        capPeriod: "month"
      })
    ]);
    // Aug: 1 × 100 (zweites Tor würde 200 > 150) — Sep: wieder 1 × 100.
    expect(result.totalCents).toBe(200);
    expect(result.perRule[0]).toMatchObject({ triggerType: "goal_total", count: 2 });
  });

  it("Rule-Cap mit capPeriod=season gilt über die gesamte Simulation", () => {
    const matches = [
      ...fixtureMatches(),
      mkMatch({ datum: "2025-09-21", teamSide: "heim", ergebnisHeim: 2, ergebnisGast: 0 })
    ];
    const result = simulateRulesOverMatches(matches, [
      mkRule({
        triggerType: "goal_total",
        amountCents: 100,
        capCents: 150,
        capPeriod: "season"
      })
    ]);
    expect(result.totalCents).toBe(100);
  });

  it("Pledge-Monats-Cap deckelt über alle Regeln eines Pacts hinweg", () => {
    const result = simulateRulesOverMatches(fixtureMatches(), [
      mkRule({
        triggerType: "goal_total",
        amountCents: 100,
        pledgeId: "p1",
        monthlyCapCents: 600
      }),
      mkRule({
        triggerType: "win",
        amountCents: 500,
        pledgeId: "p1",
        monthlyCapCents: 600
      })
    ]);
    // Aug: M1 3×100=300, win 500 → 800 > 600 → skip; M2 2×100 → 500, win skip.
    // Sep: M3 Unentschieden → nichts. Gesamt 500.
    expect(result.totalCents).toBe(500);
    const byType = Object.fromEntries(result.perRule.map((p) => [p.triggerType, p]));
    expect(byType.goal_total).toMatchObject({ count: 5, cents: 500 });
    expect(byType.win).toBeUndefined();
  });
});

describe("simulateRulesOverMatches — Saison-Regeln", () => {
  it("exkludiert Saison-Regeln und weist sie im Result aus", () => {
    const result = simulateRulesOverMatches(fixtureMatches(), [
      mkRule({ triggerType: "win", amountCents: 500 }),
      mkRule({ triggerType: "season_promotion", amountCents: 20000 }),
      mkRule({ triggerType: "season_champion", amountCents: 30000 })
    ]);
    expect(result.excludedSeasonRules).toEqual(["season_promotion", "season_champion"]);
    expect(result.totalCents).toBe(1000); // nur 2× win
  });
});
