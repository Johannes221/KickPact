/**
 * Param-Validierung pro Trigger-Typ (Audit 2026-06-11 / Phase 2 / C1).
 *
 * Vorher konnten Regeln ohne Schwellwert/Spielernamen gespeichert werden:
 * goals_scored_min ohne minGoals feuerte bei JEDEM Spiel (>= 0), goal_by_player
 * ohne Namen feuerte nie (toter Pact), monthlyCapEur=0 hieß "Cap 0 €" = alle
 * Charges geblockt. Jetzt: Zod-Reject im Builder-Step + Server, plus
 * Engine-Hardening (fehlender Schwellwert ⇒ Regel feuert NICHT).
 */
import { describe, expect, it } from "vitest";
import { pledgeInputSchema, pledgeRuleInputSchema } from "@/lib/validations/pledge";
import { evaluateTriggers, type MatchInput, type PledgeRuleInput } from "@/lib/crawler/triggers";

function rule(over: Partial<{ triggerType: string; params: Record<string, unknown> }>) {
  return {
    triggerType: "goal_total",
    amountEur: 5,
    params: {},
    ...over
  };
}

describe("pledgeRuleInputSchema (C1)", () => {
  it("goals_scored_min ohne Schwellwert → Reject", () => {
    const res = pledgeRuleInputSchema.safeParse(
      rule({ triggerType: "goals_scored_min", params: {} })
    );
    expect(res.success).toBe(false);
  });

  it("goals_scored_min mit Schwellwert 0 → Reject (mind. 1)", () => {
    const res = pledgeRuleInputSchema.safeParse(
      rule({ triggerType: "goals_scored_min", params: { min_goals: 0 } })
    );
    expect(res.success).toBe(false);
  });

  it("goals_scored_min mit Schwellwert ≥1 → ok (beide Schreibweisen)", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "goals_scored_min", params: { min_goals: 3 } })
      ).success
    ).toBe(true);
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "goals_scored_min", params: { minGoals: 3 } })
      ).success
    ).toBe(true);
  });

  it("goal_diff_min ohne Schwellwert → Reject", () => {
    const res = pledgeRuleInputSchema.safeParse(
      rule({ triggerType: "goal_diff_min", params: {} })
    );
    expect(res.success).toBe(false);
  });

  it("goal_by_player ohne Spielernamen → Reject", () => {
    const res = pledgeRuleInputSchema.safeParse(
      rule({ triggerType: "goal_by_player", params: {} })
    );
    expect(res.success).toBe(false);
  });

  it("goal_by_player mit leerem Namen → Reject", () => {
    const res = pledgeRuleInputSchema.safeParse(
      rule({ triggerType: "goal_by_player", params: { player_name: "  " } })
    );
    expect(res.success).toBe(false);
  });

  it("goal_by_player mit Namen → ok", () => {
    const res = pledgeRuleInputSchema.safeParse(
      rule({ triggerType: "goal_by_player", params: { player_name: "Max Müller" } })
    );
    expect(res.success).toBe(true);
  });
});

describe("pledgeRuleInputSchema — Saison-Pflicht-Params (Wave 4)", () => {
  it("season_table_position ohne Bereich → Reject (Builder-Pfad)", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_table_position", params: {} })
      ).success
    ).toBe(false);
  });

  it("season_table_position mit min > max → Reject", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_table_position", params: { min_pos: 5, max_pos: 2 } })
      ).success
    ).toBe(false);
  });

  it("season_table_position mit Platz 0 → Reject (ab Platz 1)", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_table_position", params: { min_pos: 0, max_pos: 5 } })
      ).success
    ).toBe(false);
  });

  it("season_table_position mit gültigem Bereich → ok (snake + camel)", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_table_position", params: { min_pos: 1, max_pos: 5 } })
      ).success
    ).toBe(true);
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_table_position", params: { minPosition: 1, maxPosition: 5 } })
      ).success
    ).toBe(true);
  });

  it("season_cup_round ohne Runde → Reject", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_cup_round", params: {} })
      ).success
    ).toBe(false);
  });

  it("season_cup_round mit Runde → ok", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_cup_round", params: { min_round: "Halbfinale" } })
      ).success
    ).toBe(true);
  });

  it("Saison-Trigger mit Cap → weiterhin Reject (Regression)", () => {
    expect(
      pledgeRuleInputSchema.safeParse({
        triggerType: "season_champion",
        amountEur: 300,
        params: {},
        capEur: 50,
        capPeriod: "season"
      }).success
    ).toBe(false);
  });

  it("season_champion ohne Params → ok (kein Pflicht-Param)", () => {
    expect(
      pledgeRuleInputSchema.safeParse(
        rule({ triggerType: "season_champion", params: {} })
      ).success
    ).toBe(true);
  });
});

describe("pledgeInputSchema monthlyCapEur (C1)", () => {
  const base = {
    invitationToken: "tok",
    rules: [rule({})]
  };

  it("monthlyCapEur=0 → Reject", () => {
    expect(pledgeInputSchema.safeParse({ ...base, monthlyCapEur: 0 }).success).toBe(false);
  });

  it("monthlyCapEur negativ → Reject", () => {
    expect(pledgeInputSchema.safeParse({ ...base, monthlyCapEur: -5 }).success).toBe(false);
  });

  it("monthlyCapEur fehlt → ok (kein Cap)", () => {
    expect(pledgeInputSchema.safeParse(base).success).toBe(true);
  });

  it("monthlyCapEur positiv → ok", () => {
    expect(pledgeInputSchema.safeParse({ ...base, monthlyCapEur: 50 }).success).toBe(true);
  });
});

describe("Engine-Hardening: fehlender Schwellwert feuert NICHT (C1)", () => {
  const match: MatchInput = {
    id: "m1",
    teamSide: "heim",
    ergebnisHeim: 4,
    ergebnisGast: 0,
    halbzeitHeim: null,
    halbzeitGast: null,
    events: []
  };

  function engineRule(triggerType: string, params: Record<string, unknown>): PledgeRuleInput {
    return {
      id: "r1",
      pledgeId: "p1",
      triggerType: triggerType as PledgeRuleInput["triggerType"],
      triggerParams: params,
      amountCents: 500,
      capCents: null,
      capPeriod: null
    };
  }

  it("goals_scored_min ohne minGoals → keine Proposals (Alt-Row-Schutz)", () => {
    expect(evaluateTriggers(match, [engineRule("goals_scored_min", {})])).toHaveLength(0);
  });

  it("goal_diff_min ohne minDiff → keine Proposals", () => {
    expect(evaluateTriggers(match, [engineRule("goal_diff_min", {})])).toHaveLength(0);
  });

  it("goals_scored_min mit gültigem Schwellwert feuert weiter", () => {
    expect(
      evaluateTriggers(match, [engineRule("goals_scored_min", { minGoals: 3 })])
    ).toHaveLength(1);
  });

  it("goal_diff_min mit gültigem Schwellwert feuert weiter", () => {
    expect(
      evaluateTriggers(match, [engineRule("goal_diff_min", { minDiff: 2 })])
    ).toHaveLength(1);
  });
});
