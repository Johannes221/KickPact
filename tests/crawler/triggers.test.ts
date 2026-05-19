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

describe("evaluateTriggers — goal_total", () => {
  it("erzeugt eine Charge pro Tor der eigenen Seite", () => {
    const match = loadFixture("win-with-goals"); // 3 Tore heim, 1 Tor gast, teamSide=heim
    const r = rule({ triggerType: "goal_total", amountCents: 500 });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(3);
    charges.forEach((c) => {
      expect(c.pledgeRuleId).toBe(r.id);
      expect(c.amountCents).toBe(500);
      expect(c.matchEventId).not.toBeNull();
      expect(c.triggerType).toBe("goal_total");
      expect(c.requiresApproval).toBe(false);
    });
  });

  it("respektiert per_match_cap (Cap stoppt vor letztem Tor, das den Cap überschreiten würde)", () => {
    const match = loadFixture("win-with-goals");
    const r = rule({ triggerType: "goal_total", amountCents: 500, perMatchCapCents: 1200 });
    const charges = evaluateTriggers(match, [r]);
    // 3 Tore × 500 = 1500. Cap 1200. Logik: emit charges in order, stop wenn next charge cap überschreiten würde.
    // Nach 2 charges: emittedSum=1000. Charge 3 würde auf 1500 gehen — 1500 > 1200, also stop.
    // Erwartung: 2 charges à 500 = 1000.
    const sum = charges.reduce((acc, c) => acc + c.amountCents, 0);
    expect(sum).toBeLessThanOrEqual(1200);
    expect(charges.length).toBe(2);
  });

  it("erzeugt nichts bei 0 Toren", () => {
    const match = loadFixture("draw-no-goals");
    const r = rule({ triggerType: "goal_total", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — goal_by_player", () => {
  it("erzeugt nur Charges für den konkreten Spieler", () => {
    const match = loadFixture("hattrick"); // Schmidt 3 Tore (heim), Maier 1 (heim), Weber 1 (gast)
    const r = rule({
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 1000
    });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(3);
    expect(charges.every((c) => c.amountCents === 1000)).toBe(true);
  });

  it("matched per playerName wenn playerId fehlt", () => {
    const match = loadFixture("win-with-goals");
    const r = rule({
      triggerType: "goal_by_player",
      triggerParams: { playerName: "Maier" },
      amountCents: 300
    });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(1);
  });

  it("ignoriert Tore der gegnerischen Seite", () => {
    const match = loadFixture("comeback-win"); // teamSide=heim
    const r = rule({
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_weber" }, // Weber spielt im gast-Team
      amountCents: 500
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});
