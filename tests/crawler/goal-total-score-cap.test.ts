/**
 * Phantom-Tor-Deckel (Audit 2026-06-11 / Phase 2 / B7).
 *
 * `goal_total` zählt pro Seite maximal min(#Tor-Events, offizieller Score).
 * Vorher zählte jedes Tor-Event — rutschten (z.B. vor einer Score-Korrektur)
 * mehr manuelle Tor-Events in die DB als der Endstand hergibt, wurde jedes
 * Phantom-Tor berechnet. Beim Deckeln haben gescrapte Events Vorrang vor
 * manuellen (fussball.de ist die Wahrheit).
 */
import { describe, expect, it } from "vitest";
import { evaluateTriggers, type MatchInput, type PledgeRuleInput } from "@/lib/crawler/triggers";

const RULE: PledgeRuleInput = {
  id: "rule1",
  pledgeId: "pledge1",
  triggerType: "goal_total",
  triggerParams: {},
  amountCents: 500,
  capCents: null,
  capPeriod: null
};

function goalEvent(
  id: string,
  source: "scraped" | "manual",
  minute = 10
): MatchInput["events"][number] {
  return {
    id,
    type: "tor",
    subtype: null,
    minute,
    side: "heim",
    playerName: null,
    playerId: null,
    source
  };
}

function match(events: MatchInput["events"], score: number): MatchInput {
  return {
    id: "m1",
    teamSide: "heim",
    ergebnisHeim: score,
    ergebnisGast: 0,
    halbzeitHeim: null,
    halbzeitGast: null,
    events
  };
}

describe("goalTotal Score-Deckel (B7)", () => {
  it("mehr Tor-Events als offizieller Score → nur score-viele Charges", () => {
    const proposals = evaluateTriggers(
      match(
        [goalEvent("e1", "scraped", 5), goalEvent("e2", "scraped", 20), goalEvent("e3", "manual", 30)],
        2
      ),
      [RULE]
    );
    expect(proposals).toHaveLength(2);
  });

  it("gescrapte Events haben beim Deckeln Vorrang vor manuellen", () => {
    const proposals = evaluateTriggers(
      match(
        [goalEvent("e_manual", "manual", 5), goalEvent("e_scraped", "scraped", 80)],
        1
      ),
      [RULE]
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].matchEventId).toBe("e_scraped");
  });

  it("Events ≤ Score → unverändert alle Events gezählt", () => {
    const proposals = evaluateTriggers(
      match([goalEvent("e1", "scraped"), goalEvent("e2", "manual", 60)], 3),
      [RULE]
    );
    expect(proposals).toHaveLength(2);
  });
});
