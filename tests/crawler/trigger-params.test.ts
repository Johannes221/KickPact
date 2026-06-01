import { describe, expect, it } from "vitest";
import {
  evaluateTriggers,
  type MatchEventInput,
  type MatchInput,
  type PledgeRuleInput,
  type TriggerType
} from "@/lib/crawler/triggers";
import { normalizeTriggerParams } from "@/lib/validations/pledge";

/**
 * Regressionstest für das UI↔Engine-Casing-Mismatch (Staging-E2E 2026-06-01):
 * Der Pact-Wizard schreibt snake_case (`min_goals`, `min_diff`, `player_name`),
 * die Engine liest camelCase. Ohne Normalisierung las die Engine `undefined` →
 * Default `0` → goals_scored_min / goal_diff_min feuerten bei JEDEM Spiel,
 * goal_by_player nie.
 *
 * Diese Tests gehen durch dieselbe Grenze wie `create-pledge.ts`:
 * UI-Params (snake) → normalizeTriggerParams → evaluateTriggers.
 */

function goal(
  side: MatchEventInput["side"],
  playerName: string,
  id: string
): MatchEventInput {
  return { id, type: "tor", minute: 50, side, playerName, playerId: null, source: "scraped" };
}

function match(overrides: Partial<MatchInput>): MatchInput {
  return {
    id: "m_test",
    teamSide: "heim",
    ergebnisHeim: 0,
    ergebnisGast: 0,
    halbzeitHeim: null,
    halbzeitGast: null,
    events: [],
    ...overrides
  };
}

/** Baut eine Rule so, wie sie nach create-pledge gespeichert würde: UI-Params durch normalize. */
function ruleFromUi(
  triggerType: TriggerType,
  uiParams: Record<string, unknown>
): PledgeRuleInput {
  return {
    id: "r_" + triggerType,
    pledgeId: "p_test",
    triggerType,
    triggerParams: normalizeTriggerParams(uiParams),
    amountCents: 500,
    perMatchCapCents: null
  };
}

describe("normalizeTriggerParams — key mapping", () => {
  it("mappt alle Wizard-snake_case-Keys auf die Engine-camelCase-Keys", () => {
    expect(
      normalizeTriggerParams({
        min_goals: 5,
        min_diff: 3,
        player_name: "Schmidt",
        min_pos: 1,
        max_pos: 5
      })
    ).toEqual({
      minGoals: 5,
      minDiff: 3,
      playerName: "Schmidt",
      minPosition: 1,
      maxPosition: 5
    });
  });

  it("lässt bereits-camelCase- und unbekannte Keys unverändert", () => {
    expect(normalizeTriggerParams({ minGoals: 4, subtype: "kopfball" })).toEqual({
      minGoals: 4,
      subtype: "kopfball"
    });
  });

  it("liefert {} für leere Params", () => {
    expect(normalizeTriggerParams({})).toEqual({});
  });
});

describe("goals_scored_min — Threshold wird respektiert (snake_case UI-Params)", () => {
  // Eigene Mannschaft (heim) schießt genau 3 Tore.
  const threeGoals = match({
    ergebnisHeim: 3,
    ergebnisGast: 1,
    events: [
      goal("heim", "A", "g1"),
      goal("heim", "B", "g2"),
      goal("heim", "C", "g3"),
      goal("gast", "X", "g4")
    ]
  });

  it("feuert NICHT, wenn eigene Tore unter min_goals", () => {
    const r = ruleFromUi("goals_scored_min", { min_goals: 5 });
    expect(evaluateTriggers(threeGoals, [r])).toHaveLength(0);
  });

  it("feuert genau 1×, wenn eigene Tore == min_goals", () => {
    const r = ruleFromUi("goals_scored_min", { min_goals: 3 });
    expect(evaluateTriggers(threeGoals, [r])).toHaveLength(1);
  });

  it("Safety-Net: Engine respektiert die Schwelle auch bei NICHT-normalisierten snake-Params", () => {
    // Falls eine Bestands-Row noch nicht durch Migration 0039 lief: die Engine
    // liest defensiv `min_goals`, statt auf Default 0 zu fallen.
    const raw: PledgeRuleInput = {
      id: "r_raw",
      pledgeId: "p",
      triggerType: "goals_scored_min",
      triggerParams: { min_goals: 5 }, // bewusst NICHT normalisiert
      amountCents: 500,
      perMatchCapCents: null
    };
    expect(evaluateTriggers(threeGoals, [raw])).toHaveLength(0);
  });
});

describe("goal_diff_min — Threshold wird respektiert (snake_case UI-Params)", () => {
  // 3:0-Sieg → Tordifferenz 3.
  const winByThree = match({
    ergebnisHeim: 3,
    ergebnisGast: 0,
    events: [goal("heim", "A", "g1"), goal("heim", "B", "g2"), goal("heim", "C", "g3")]
  });

  it("feuert, wenn Tordifferenz == min_diff", () => {
    const r = ruleFromUi("goal_diff_min", { min_diff: 3 });
    expect(evaluateTriggers(winByThree, [r])).toHaveLength(1);
  });

  it("feuert NICHT, wenn Tordifferenz unter min_diff", () => {
    const r = ruleFromUi("goal_diff_min", { min_diff: 4 });
    expect(evaluateTriggers(winByThree, [r])).toHaveLength(0);
  });
});

describe("goal_by_player — feuert nur für den benannten Spieler (snake_case UI-Param)", () => {
  // Eigene Mannschaft: Schmidt 2 Tore, Maier 1 Tor; Gegner Weber 1 Tor.
  const m = match({
    ergebnisHeim: 3,
    ergebnisGast: 1,
    events: [
      goal("heim", "Schmidt", "g1"),
      goal("heim", "Schmidt", "g2"),
      goal("heim", "Maier", "g3"),
      goal("gast", "Weber", "g4")
    ]
  });

  it("erzeugt 1 Charge pro Tor des benannten Spielers", () => {
    const r = ruleFromUi("goal_by_player", { player_name: "Schmidt" });
    expect(evaluateTriggers(m, [r])).toHaveLength(2);
  });

  it("feuert NICHT für einen Spieler ohne eigene Tore", () => {
    const r = ruleFromUi("goal_by_player", { player_name: "Weber" }); // spielt gegnerisch
    expect(evaluateTriggers(m, [r])).toHaveLength(0);
  });
});
