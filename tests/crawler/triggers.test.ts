import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateTriggers, type MatchInput, type PledgeRuleInput } from "@/lib/crawler/triggers";

function loadFixture(name: string): MatchInput {
  const file = path.resolve(__dirname, "../fixtures/matches", `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function rule(overrides: Partial<PledgeRuleInput>): PledgeRuleInput {
  return {
    id: "r_" + Math.random().toString(36).slice(2, 8),
    pledgeId: "p_test",
    triggerType: "goal_total",
    triggerParams: {},
    amountCents: 500,
    perMatchCapCents: null,
    ...overrides
  };
}

describe("evaluateTriggers — placeholder", () => {
  it("throws not-implemented (will be replaced as we add triggers)", () => {
    const match = loadFixture("draw-no-goals");
    expect(() => evaluateTriggers(match, [])).toThrowError("not implemented");
  });
});
