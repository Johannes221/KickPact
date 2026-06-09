import { describe, expect, it } from "vitest";
import {
  evaluateTriggers,
  type MatchInput,
  type PledgeRuleInput
} from "@/lib/crawler/triggers";

/**
 * „Nur Ergebnis"-Mannschaften (results_only): fußball.de liefert den echten
 * Endstand, aber KEINE Tor-Events. Ergebnis-basierte Wetten müssen trotzdem
 * feuern; goal_total muss nach dem Score zählen (nicht nach Events).
 */
function rule(overrides: Partial<PledgeRuleInput>): PledgeRuleInput {
  return {
    id: "r1",
    pledgeId: "p1",
    triggerType: "goal_total",
    triggerParams: {},
    amountCents: 500,
    perMatchCapCents: null,
    ...overrides
  };
}

// 3:1-Sieg, teamSide=heim, OHNE Tor-Events (results_only-Szenario).
const resultsOnly: MatchInput = {
  id: "m1",
  teamSide: "heim",
  ergebnisHeim: 3,
  ergebnisGast: 1,
  halbzeitHeim: null,
  halbzeitGast: null,
  events: []
};

describe("evaluateTriggers — results_only (Score ohne Events)", () => {
  it("goal_total feuert ownScore-mal (3) als anonyme Auto-Charge", () => {
    const charges = evaluateTriggers(resultsOnly, [rule({ triggerType: "goal_total" })]);
    expect(charges).toHaveLength(3);
    charges.forEach((c) => {
      expect(c.matchEventId).toBeNull(); // keine Events → keine Verknüpfung
      expect(c.requiresApproval).toBe(false); // offizieller Endstand → keine Freigabe
      expect(c.amountCents).toBe(500);
    });
  });

  it("win feuert (aus Score abgeleitet)", () => {
    expect(evaluateTriggers(resultsOnly, [rule({ triggerType: "win" })])).toHaveLength(1);
  });

  it("goal_diff_min ≥2 feuert (Tordifferenz 2)", () => {
    const charges = evaluateTriggers(resultsOnly, [
      rule({ triggerType: "goal_diff_min", triggerParams: { minDiff: 2 } })
    ]);
    expect(charges).toHaveLength(1);
  });

  it("goal_by_player feuert NICHT ohne Tor-Events (kein Torschütze)", () => {
    const charges = evaluateTriggers(resultsOnly, [
      rule({ triggerType: "goal_by_player", triggerParams: { playerName: "Müller" } })
    ]);
    expect(charges).toHaveLength(0);
  });

  it("hattrick feuert NICHT ohne Tor-Events", () => {
    const charges = evaluateTriggers(resultsOnly, [rule({ triggerType: "hattrick" })]);
    expect(charges).toHaveLength(0);
  });
});

describe("evaluateTriggers — goal_total bleibt event-verknüpft bei vollem Bericht", () => {
  it("2 eigene Tor-Events + Score 2:0 → 2 Charges, je mit matchEventId", () => {
    const full: MatchInput = {
      id: "m2",
      teamSide: "heim",
      ergebnisHeim: 2,
      ergebnisGast: 0,
      halbzeitHeim: null,
      halbzeitGast: null,
      events: [
        { id: "e1", type: "tor", minute: 10, side: "heim", playerName: "A", source: "scraped" },
        { id: "e2", type: "tor", minute: 50, side: "heim", playerName: "B", source: "scraped" }
      ]
    };
    const charges = evaluateTriggers(full, [rule({ triggerType: "goal_total" })]);
    expect(charges).toHaveLength(2);
    expect(charges.map((c) => c.matchEventId).sort()).toEqual(["e1", "e2"]);
  });
});
