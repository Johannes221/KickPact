import { describe, it, expect } from "vitest";
import { evaluateTriggers, type MatchInput } from "../../../lib/crawler/triggers";
import { rule } from "./_helpers";

/**
 * Manual-approval triggers operate on `source: "manual"` events that the
 * verein reports via the Manual-Events UI. The engine emits proposals with
 * `requiresApproval: true` for these — sponsors approve them before they
 * count toward an invoice.
 */
function syntheticMatch(events: MatchInput["events"]): MatchInput {
  return {
    id: "m_synthetic",
    teamSide: "heim",
    ergebnisHeim: 2,
    ergebnisGast: 1,
    halbzeitHeim: 1,
    halbzeitGast: 0,
    events,
  };
}

describe("manual approval triggers", () => {
  const subtypes = [
    "kopfball",
    "hackentor",
    "volley",
    "fernschuss",
    "elfmeter",
    "freistoss",
  ] as const;

  for (const subtype of subtypes) {
    it(`special_goal/${subtype} emits one approval charge per matching event`, () => {
      const m = syntheticMatch([
        {
          id: "e1",
          minute: 10,
          type: "spezial",
          subtype,
          side: "heim",
          playerId: "P1",
          playerName: "Spieler 1",
          source: "manual",
        },
        // wrong subtype — should not fire
        {
          id: "e2",
          minute: 30,
          type: "spezial",
          subtype: null,
          side: "heim",
          playerId: "P2",
          playerName: "Spieler 2",
          source: "manual",
        },
      ]);
      const proposals = evaluateTriggers(m, [
        rule({
          triggerType: "special_goal",
          triggerParams: { subtype },
          amountCents: 500,
        }),
      ]);
      expect(proposals.length).toBe(1);
      expect(proposals[0].requiresApproval).toBe(true);
      expect(proposals[0].matchEventId).toBe("e1");
    });
  }

  it("yellow_card emits one charge per yellow karte event", () => {
    const m = syntheticMatch([
      {
        id: "y1",
        minute: 22,
        type: "karte",
        subtype: "gelb",
        side: "heim",
        playerId: "P1",
        playerName: "P1",
        source: "manual",
      },
      {
        id: "y2",
        minute: 70,
        type: "karte",
        subtype: "gelb",
        side: "heim",
        playerId: "P2",
        playerName: "P2",
        source: "manual",
      },
      {
        id: "r1",
        minute: 88,
        type: "karte",
        subtype: "rot",
        side: "heim",
        playerId: "P3",
        playerName: "P3",
        source: "manual",
      },
    ]);
    const yellow = evaluateTriggers(m, [
      rule({ triggerType: "yellow_card", amountCents: 200 }),
    ]);
    expect(yellow.length).toBe(2);
    expect(yellow.every((p) => p.requiresApproval)).toBe(true);

    const red = evaluateTriggers(m, [
      rule({ triggerType: "red_card", amountCents: 500 }),
    ]);
    expect(red.length).toBe(1);
    expect(red[0].requiresApproval).toBe(true);
  });

  it("assist propagates requiresApproval=true", () => {
    const m = syntheticMatch([
      {
        id: "a1",
        minute: 60,
        type: "spezial",
        subtype: "assist",
        side: "heim",
        playerId: "P1",
        playerName: "P1",
        source: "manual",
      },
    ]);
    const props = evaluateTriggers(m, [
      rule({ triggerType: "assist", amountCents: 300 }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].requiresApproval).toBe(true);
  });

  it("man_of_match propagates requiresApproval=true", () => {
    const m = syntheticMatch([
      {
        id: "mom1",
        minute: 90,
        type: "spezial",
        subtype: "man_of_match",
        side: "heim",
        playerId: "P1",
        playerName: "P1",
        source: "manual",
      },
    ]);
    const props = evaluateTriggers(m, [
      rule({ triggerType: "man_of_match", amountCents: 800 }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].requiresApproval).toBe(true);
  });

  it("custom trigger fires for matching subtype with approval flag", () => {
    const m = syntheticMatch([
      {
        id: "c1",
        minute: 40,
        type: "spezial",
        subtype: "fairplay-award",
        side: "heim",
        playerId: null,
        playerName: null,
        source: "manual",
      },
    ]);
    const props = evaluateTriggers(m, [
      rule({
        triggerType: "custom",
        triggerParams: { subtype: "fairplay-award" },
        amountCents: 1000,
      }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].requiresApproval).toBe(true);
  });

  it("manual triggers ignore events from the opposing side", () => {
    const m = syntheticMatch([
      {
        id: "opp1",
        minute: 30,
        type: "karte",
        subtype: "gelb",
        side: "gast",
        playerId: "X",
        playerName: "X",
        source: "manual",
      },
    ]);
    const props = evaluateTriggers(m, [
      rule({ triggerType: "yellow_card", amountCents: 100 }),
    ]);
    expect(props.length).toBe(0);
  });

  it("manual triggers ignore scraped (non-manual) events", () => {
    const m = syntheticMatch([
      {
        id: "k1",
        minute: 30,
        type: "karte",
        subtype: "gelb",
        side: "heim",
        playerId: "P",
        playerName: "P",
        source: "scraped",
      },
    ]);
    const props = evaluateTriggers(m, [
      rule({ triggerType: "yellow_card", amountCents: 100 }),
    ]);
    expect(props.length).toBe(0);
  });
});
