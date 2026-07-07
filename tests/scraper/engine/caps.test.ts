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

// Der frühere Pro-Spiel-Cap (`perMatchCapCents`) wurde mit Migration 0040 durch
// capCents+capPeriod abgelöst und aus der Engine entfernt (Feld existiert nicht
// mehr auf PledgeRuleInput). Die Engine kappt NICHT mehr pro Spiel — alle Caps
// laufen DB-bewusst downstream (evaluate-match/recalc, skip-Semantik). Dieser
// Test hält fest, dass kein Pro-Spiel-Cap-Verhalten in die Engine zurückkehrt.
describe("engine emits uncapped (per-match cap removed)", () => {
  it("5 Tore => 5 Charges, ohne Engine-seitige Kappung", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ triggerType: "goal_total", amountCents: 100 }),
    ]);
    expect(props.length).toBe(5);
  });
});
