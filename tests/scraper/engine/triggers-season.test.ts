import { describe, it, expect } from "vitest";
import {
  evaluateSeasonTriggers,
  type SeasonInput,
  type PledgeRuleInput,
} from "../../../lib/crawler/triggers";

function seasonRule(overrides: Partial<PledgeRuleInput>): PledgeRuleInput {
  return {
    id: "rs_test",
    pledgeId: "p_test",
    triggerType: "season_promotion",
    triggerParams: {},
    amountCents: 5000,
    perMatchCapCents: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<SeasonInput> = {}): SeasonInput {
  return {
    teamId: "t1",
    saison: "2526",
    finalPosition: 8,
    totalTeams: 16,
    promoted: false,
    relegated: false,
    champion: false,
    cupRound: null,
    ...overrides,
  };
}

describe("season triggers", () => {
  it("season_promotion fires when team is promoted", () => {
    const input = baseInput({ finalPosition: 1, promoted: true });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_promotion" }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].amountCents).toBe(5000);
    expect(props[0].matchId).toBe(null);
    expect(props[0].matchEventId).toBe(null);
    expect(props[0].saison).toBe("2526");
    expect(props[0].requiresApproval).toBe(false);
  });

  it("season_promotion does NOT fire when not promoted", () => {
    const input = baseInput({ finalPosition: 8 });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_promotion" }),
    ]);
    expect(props.length).toBe(0);
  });

  it("season_no_relegation fires when team was not relegated", () => {
    const input = baseInput({ finalPosition: 13, relegated: false });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_no_relegation" }),
    ]);
    expect(props.length).toBe(1);
  });

  it("season_no_relegation does NOT fire when team was relegated", () => {
    const input = baseInput({ finalPosition: 16, relegated: true });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_no_relegation" }),
    ]);
    expect(props.length).toBe(0);
  });

  it("season_table_position fires when finalPosition <= maxPosition", () => {
    const input = baseInput({ finalPosition: 3 });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({
        triggerType: "season_table_position",
        triggerParams: { maxPosition: 5 },
      }),
    ]);
    expect(props.length).toBe(1);
  });

  it("season_table_position does NOT fire when finalPosition > maxPosition", () => {
    const input = baseInput({ finalPosition: 8 });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({
        triggerType: "season_table_position",
        triggerParams: { maxPosition: 5 },
      }),
    ]);
    expect(props.length).toBe(0);
  });

  it("season_table_position accepts snake_case `max_position` param", () => {
    const input = baseInput({ finalPosition: 2 });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({
        triggerType: "season_table_position",
        triggerParams: { max_position: 3 },
      }),
    ]);
    expect(props.length).toBe(1);
  });

  it("season_champion fires only when champion=true", () => {
    const champ = baseInput({ finalPosition: 1, promoted: true, champion: true });
    const second = baseInput({ finalPosition: 2, champion: false });
    expect(
      evaluateSeasonTriggers(champ, [seasonRule({ triggerType: "season_champion" })])
        .length
    ).toBe(1);
    expect(
      evaluateSeasonTriggers(second, [seasonRule({ triggerType: "season_champion" })])
        .length
    ).toBe(0);
  });

  it("season_cup_round fires for matching round name only", () => {
    const halffinal = baseInput({ cupRound: "Halbfinale" });
    const final = baseInput({ cupRound: "Finale" });
    const rule = seasonRule({
      triggerType: "season_cup_round",
      triggerParams: { round: "Halbfinale" },
    });
    expect(evaluateSeasonTriggers(halffinal, [rule]).length).toBe(1);
    expect(evaluateSeasonTriggers(final, [rule]).length).toBe(0);
  });

  it("season_cup_round does NOT fire when cupRound is null", () => {
    const input = baseInput({ cupRound: null });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({
        triggerType: "season_cup_round",
        triggerParams: { round: "Halbfinale" },
      }),
    ]);
    expect(props.length).toBe(0);
  });

  it("season_custom always fires AND requires approval", () => {
    const input = baseInput();
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_custom", amountCents: 3000 }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].requiresApproval).toBe(true);
    expect(props[0].amountCents).toBe(3000);
  });

  it("two season-rules of same type fire independently (no global dedup)", () => {
    const input = baseInput({ finalPosition: 1, promoted: true, champion: true });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_promotion", id: "rs_a" }),
      seasonRule({ triggerType: "season_promotion", id: "rs_b" }),
    ]);
    expect(props.length).toBe(2);
    expect(new Set(props.map((p) => p.pledgeRuleId)).size).toBe(2);
  });

  it("non-season trigger types in the rule list are silently skipped", () => {
    const input = baseInput({ promoted: true });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "goal_total" }), // non-season → skipped
      seasonRule({ triggerType: "season_promotion" }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].triggerType).toBe("season_promotion");
  });

  it("emits saison field on every charge proposal", () => {
    const input = baseInput({ saison: "2425", promoted: true });
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_promotion" }),
    ]);
    expect(props[0].saison).toBe("2425");
  });
});
