import { describe, it, expect } from "vitest";
import { evaluateTriggers, type MatchInput } from "../../../lib/crawler/triggers";
import { rule, loadMatchFixture, listMatchFixtures } from "./_helpers";

const SYNTHETIC_MATCHES: MatchInput[] = [
  // 3:0 win, clean sheet, 2 of 3 goals by same player
  {
    id: "m_syn_1",
    teamSide: "heim",
    ergebnisHeim: 3,
    ergebnisGast: 0,
    halbzeitHeim: 1,
    halbzeitGast: 0,
    events: [
      { id: "s1g1", type: "tor", subtype: null, minute: 10, side: "heim", playerId: "PA", playerName: "A", source: "scraped" },
      { id: "s1g2", type: "tor", subtype: null, minute: 50, side: "heim", playerId: "PA", playerName: "A", source: "scraped" },
      { id: "s1g3", type: "tor", subtype: null, minute: 70, side: "heim", playerId: "PB", playerName: "B", source: "scraped" },
    ],
  },
  // 0:0 draw, no goals
  {
    id: "m_syn_2",
    teamSide: "heim",
    ergebnisHeim: 0,
    ergebnisGast: 0,
    halbzeitHeim: 0,
    halbzeitGast: 0,
    events: [],
  },
  // 1:2 loss
  {
    id: "m_syn_3",
    teamSide: "heim",
    ergebnisHeim: 1,
    ergebnisGast: 2,
    halbzeitHeim: 1,
    halbzeitGast: 1,
    events: [
      { id: "s3g1", type: "tor", subtype: null, minute: 20, side: "heim", playerId: "PA", playerName: "A", source: "scraped" },
      { id: "s3g2", type: "tor", subtype: null, minute: 30, side: "gast", playerId: "OPP", playerName: "OPP", source: "scraped" },
      { id: "s3g3", type: "tor", subtype: null, minute: 75, side: "gast", playerId: "OPP", playerName: "OPP", source: "scraped" },
    ],
  },
];

describe("combo scenarios — synthetic matches", () => {
  it("three sponsors on same team — each gets their own charges, independent of one another", () => {
    const m = SYNTHETIC_MATCHES[0]; // 3:0 win, clean sheet
    const props = evaluateTriggers(m, [
      rule({ id: "rA", pledgeId: "pA", triggerType: "goal_total", amountCents: 100 }),
      rule({ id: "rB", pledgeId: "pB", triggerType: "win", amountCents: 500 }),
      rule({ id: "rC", pledgeId: "pC", triggerType: "clean_sheet", amountCents: 1000 }),
    ]);
    const pA = props.filter((p) => p.pledgeId === "pA");
    const pB = props.filter((p) => p.pledgeId === "pB");
    const pC = props.filter((p) => p.pledgeId === "pC");
    const ownGoals = m.events.filter((e) => e.type === "tor" && e.side === m.teamSide).length;
    expect(pA.length).toBe(ownGoals); // 3
    expect(pB.length).toBe(1);
    expect(pC.length).toBe(1);
    // independence: every charge keeps its own pledgeId
    expect(new Set(props.map((p) => p.pledgeId))).toEqual(new Set(["pA", "pB", "pC"]));
  });

  it("same rule across multiple matches yields independent proposals (no cross-match state)", () => {
    const winRule = rule({ triggerType: "win", amountCents: 500 });
    const proposals = SYNTHETIC_MATCHES.flatMap((m) => evaluateTriggers(m, [winRule]));
    // win only on m_syn_1
    expect(proposals.length).toBe(1);
    expect(proposals[0].matchId).toBe("m_syn_1");
  });

  it("multi-trigger mix on a loss match: only `loss` fires, no goal-total, no win", () => {
    const m = SYNTHETIC_MATCHES[2]; // 1:2 loss
    const props = evaluateTriggers(m, [
      rule({ id: "rA", triggerType: "win", amountCents: 500 }),
      rule({ id: "rB", triggerType: "loss", amountCents: 200 }),
      rule({ id: "rC", triggerType: "goal_total", amountCents: 100 }),
    ]);
    const wins = props.filter((p) => p.triggerType === "win");
    const losses = props.filter((p) => p.triggerType === "loss");
    const goals = props.filter((p) => p.triggerType === "goal_total");
    expect(wins.length).toBe(0);
    expect(losses.length).toBe(1);
    expect(goals.length).toBe(1); // one own goal scored
  });

  it("0:0 draw produces no charges except a draw rule", () => {
    const m = SYNTHETIC_MATCHES[1];
    const props = evaluateTriggers(m, [
      rule({ id: "rA", triggerType: "goal_total", amountCents: 100 }),
      rule({ id: "rB", triggerType: "win", amountCents: 500 }),
      rule({ id: "rC", triggerType: "draw", amountCents: 200 }),
      rule({ id: "rD", triggerType: "clean_sheet", amountCents: 1000 }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].pledgeRuleId).toBe("rC");
  });

  it("combos interact: per-goal rules emit per goal, outcome rule once", () => {
    const m = SYNTHETIC_MATCHES[0]; // 3 own goals
    const props = evaluateTriggers(m, [
      rule({ id: "rA", triggerType: "goal_total", amountCents: 100 }), // 3
      rule({ id: "rB", triggerType: "goal_total", amountCents: 100 }), // 3
      rule({ id: "rC", triggerType: "clean_sheet", amountCents: 1000 }), // 1
    ]);
    expect(props.filter((p) => p.pledgeRuleId === "rA").length).toBe(3);
    expect(props.filter((p) => p.pledgeRuleId === "rB").length).toBe(3);
    expect(props.filter((p) => p.pledgeRuleId === "rC").length).toBe(1);
  });
});

describe("combo scenarios — real Dossenheim fixtures", () => {
  const ids = listMatchFixtures("dossenheim", "herren1");
  if (ids.length === 0) {
    it.skip("no Dossenheim herren1 spiel-fixtures captured yet", () => {});
  } else {
    it("three sponsors on same team — pA emits per own goal", () => {
      const m = loadMatchFixture(
        "dossenheim",
        "herren1",
        ids[0],
        "FC Sportfreunde 1910 Dossenheim"
      );
      const props = evaluateTriggers(m, [
        rule({ id: "rA", pledgeId: "pA", triggerType: "goal_total", amountCents: 100 }),
        rule({ id: "rB", pledgeId: "pB", triggerType: "win", amountCents: 500 }),
        rule({ id: "rC", pledgeId: "pC", triggerType: "clean_sheet", amountCents: 1000 }),
      ]);
      const pA = props.filter((p) => p.pledgeId === "pA");
      const ownGoals = m.events.filter((e) => e.type === "tor" && e.side === m.teamSide).length;
      expect(pA.length).toBe(ownGoals);
    });

    it("win rule across all captured matches stays bounded by match count", () => {
      const proposals = ids.flatMap((id) =>
        evaluateTriggers(
          loadMatchFixture("dossenheim", "herren1", id, "FC Sportfreunde 1910 Dossenheim"),
          [rule({ triggerType: "win", amountCents: 500 })]
        )
      );
      expect(proposals.length).toBeLessThanOrEqual(ids.length);
    });
  }
});
