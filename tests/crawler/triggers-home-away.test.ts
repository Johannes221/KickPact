/**
 * W2 (Saison-Features 2026-06-12): Heim-/Auswärtssieg als eigene Regel-Typen.
 *
 * home_win feuert bei Sieg UND teamSide==="heim", away_win bei Sieg UND
 * teamSide==="gast". requiresApproval-Verhalten identisch zu `win` (Outcome-
 * Charge ohne Approval — die Coverage-Policy K2 greift downstream in
 * evaluate-match via applyCoverageApprovalPolicy, nicht in der Engine).
 */
import { describe, expect, it } from "vitest";
import {
  evaluateTriggers,
  type MatchInput,
  type PledgeRuleInput,
  type TriggerType
} from "@/lib/crawler/triggers";

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

function rule(triggerType: TriggerType): PledgeRuleInput {
  return {
    id: `r_${triggerType}`,
    pledgeId: "p_test",
    triggerType,
    triggerParams: {},
    amountCents: 700,
    perMatchCapCents: null
  };
}

// Die 4 Konstellationen aus dem Plan (× beide Typen) + Unentschieden.
const heimsieg = match({ teamSide: "heim", ergebnisHeim: 3, ergebnisGast: 1 });
const heimniederlage = match({ teamSide: "heim", ergebnisHeim: 0, ergebnisGast: 2 });
const auswaertssieg = match({ teamSide: "gast", ergebnisHeim: 1, ergebnisGast: 4 });
const auswaertsniederlage = match({ teamSide: "gast", ergebnisHeim: 2, ergebnisGast: 0 });
const unentschiedenHeim = match({ teamSide: "heim", ergebnisHeim: 1, ergebnisGast: 1 });
const unentschiedenGast = match({ teamSide: "gast", ergebnisHeim: 1, ergebnisGast: 1 });

describe("evaluateTriggers — home_win", () => {
  it("feuert 1× bei Heimsieg, ohne Approval, ohne Event-Bindung", () => {
    const charges = evaluateTriggers(heimsieg, [rule("home_win")]);
    expect(charges).toHaveLength(1);
    expect(charges[0].triggerType).toBe("home_win");
    expect(charges[0].amountCents).toBe(700);
    expect(charges[0].matchEventId).toBeNull();
    expect(charges[0].requiresApproval).toBe(false);
  });

  it("feuert NICHT bei Heimniederlage", () => {
    expect(evaluateTriggers(heimniederlage, [rule("home_win")])).toHaveLength(0);
  });

  it("feuert NICHT bei Auswärtssieg (Sieg, aber falsche Seite)", () => {
    expect(evaluateTriggers(auswaertssieg, [rule("home_win")])).toHaveLength(0);
  });

  it("feuert NICHT bei Auswärtsniederlage", () => {
    expect(evaluateTriggers(auswaertsniederlage, [rule("home_win")])).toHaveLength(0);
  });

  it("feuert NICHT bei Unentschieden (heim)", () => {
    expect(evaluateTriggers(unentschiedenHeim, [rule("home_win")])).toHaveLength(0);
  });
});

describe("evaluateTriggers — away_win", () => {
  it("feuert 1× bei Auswärtssieg, ohne Approval, ohne Event-Bindung", () => {
    const charges = evaluateTriggers(auswaertssieg, [rule("away_win")]);
    expect(charges).toHaveLength(1);
    expect(charges[0].triggerType).toBe("away_win");
    expect(charges[0].amountCents).toBe(700);
    expect(charges[0].matchEventId).toBeNull();
    expect(charges[0].requiresApproval).toBe(false);
  });

  it("feuert NICHT bei Auswärtsniederlage", () => {
    expect(evaluateTriggers(auswaertsniederlage, [rule("away_win")])).toHaveLength(0);
  });

  it("feuert NICHT bei Heimsieg (Sieg, aber falsche Seite)", () => {
    expect(evaluateTriggers(heimsieg, [rule("away_win")])).toHaveLength(0);
  });

  it("feuert NICHT bei Heimniederlage", () => {
    expect(evaluateTriggers(heimniederlage, [rule("away_win")])).toHaveLength(0);
  });

  it("feuert NICHT bei Unentschieden (gast)", () => {
    expect(evaluateTriggers(unentschiedenGast, [rule("away_win")])).toHaveLength(0);
  });
});

describe("evaluateTriggers — home_win/away_win neben win", () => {
  it("Heimsieg: win + home_win feuern, away_win nicht", () => {
    const charges = evaluateTriggers(heimsieg, [
      rule("win"),
      rule("home_win"),
      rule("away_win")
    ]);
    expect(charges.map((c) => c.triggerType).sort()).toEqual(["home_win", "win"]);
  });

  it("Auswärtssieg: win + away_win feuern, home_win nicht", () => {
    const charges = evaluateTriggers(auswaertssieg, [
      rule("win"),
      rule("home_win"),
      rule("away_win")
    ]);
    expect(charges.map((c) => c.triggerType).sort()).toEqual(["away_win", "win"]);
  });
});
