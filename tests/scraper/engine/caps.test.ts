import { describe, it, expect } from "vitest";
import { evaluateTriggers, type MatchInput } from "../../../lib/crawler/triggers";
import { rule } from "./_helpers";

const FIVE_GOAL_MATCH: MatchInput = {
  id: "m_caps",
  teamSide: "heim",
  ergebnisHeim: 5,
  ergebnisGast: 1,
  halbzeitHeim: 3,
  halbzeitGast: 0,
  events: [
    ...[1, 15, 30, 60, 80].map((min, i) => ({
      id: `g${i}`,
      minute: min,
      type: "tor" as const,
      subtype: null,
      side: "heim" as const,
      playerId: `P${i}`,
      playerName: `Spieler ${i}`,
      source: "scraped" as const,
    })),
    {
      id: "g_opp",
      minute: 70,
      type: "tor" as const,
      subtype: null,
      side: "gast" as const,
      playerId: "OPP",
      playerName: "Gegner",
      source: "scraped" as const,
    },
  ],
};

describe("per_match_cap enforcement", () => {
  it("per_match_cap = null => unlimited emission", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: null }),
    ]);
    expect(props.length).toBe(5);
  });

  it("per_match_cap stops emission once next charge would exceed cap", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 250 }),
    ]);
    const sum = props.reduce((a, p) => a + p.amountCents, 0);
    expect(sum).toBeLessThanOrEqual(250);
    // 100 + 100 = 200 (3rd would push to 300, exceeding cap)
    expect(props.length).toBe(2);
  });

  it("per_match_cap = 0 emits nothing", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 0 }),
    ]);
    expect(props.length).toBe(0);
  });

  it("per_match_cap = exactly one trigger amount emits exactly one", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 100 }),
    ]);
    expect(props.length).toBe(1);
  });

  it("per_match_cap larger than total possible emission emits all charges", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 10_000 }),
    ]);
    expect(props.length).toBe(5);
  });

  it("multiple rules each enforce their own cap independently", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({
        id: "rA",
        triggerType: "goal_total",
        amountCents: 100,
        perMatchCapCents: 200,
      }),
      rule({
        id: "rB",
        triggerType: "goal_total",
        amountCents: 50,
        perMatchCapCents: 150,
      }),
    ]);
    const sumA = props
      .filter((p) => p.pledgeRuleId === "rA")
      .reduce((a, p) => a + p.amountCents, 0);
    const sumB = props
      .filter((p) => p.pledgeRuleId === "rB")
      .reduce((a, p) => a + p.amountCents, 0);
    expect(sumA).toBeLessThanOrEqual(200);
    expect(sumB).toBeLessThanOrEqual(150);
    // rA: 100+100=200 (3rd would be 300) → 2 charges
    expect(props.filter((p) => p.pledgeRuleId === "rA").length).toBe(2);
    // rB: 50+50+50=150 (4th would be 200) → 3 charges
    expect(props.filter((p) => p.pledgeRuleId === "rB").length).toBe(3);
  });

  it("cap does not affect rules with no matches at all", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "loss", amountCents: 100, perMatchCapCents: 50 }),
    ]);
    // Team won 5:1 — `loss` does not fire regardless of cap
    expect(props.length).toBe(0);
  });

  it("cap interacts with outcome triggers (single proposal stopped by tiny cap)", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "win", amountCents: 1000, perMatchCapCents: 500 }),
    ]);
    // Single charge of 1000 would exceed cap of 500 → 0 emitted
    expect(props.length).toBe(0);
  });
});
