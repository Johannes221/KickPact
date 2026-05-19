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

describe("evaluateTriggers — match-level outcomes", () => {
  it("win erzeugt 1× Charge bei Sieg", () => {
    const match = loadFixture("win-with-goals"); // heim 3:1
    const r = rule({ triggerType: "win", amountCents: 1000 });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(1);
    expect(charges[0].matchEventId).toBeNull();
    expect(charges[0].amountCents).toBe(1000);
  });

  it("win erzeugt 0× Charge bei Unentschieden", () => {
    const match = loadFixture("draw-no-goals");
    const r = rule({ triggerType: "win", amountCents: 1000 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("draw erzeugt 1× Charge bei Unentschieden", () => {
    const match = loadFixture("draw-no-goals");
    const r = rule({ triggerType: "draw", amountCents: 200 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("loss erzeugt 1× Charge bei Niederlage (teamSide ist gast in einem heim-Sieg)", () => {
    const match = loadFixture("win-with-goals");
    match.teamSide = "gast"; // gast verliert 1:3
    const r = rule({ triggerType: "loss", amountCents: 100 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("clean_sheet erzeugt 1× Charge bei Sieg + 0 Gegentore", () => {
    const match = loadFixture("clean-sheet"); // heim 2:0
    const r = rule({ triggerType: "clean_sheet", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("clean_sheet erzeugt 0× Charge wenn Gegentor", () => {
    const match = loadFixture("win-with-goals"); // heim 3:1
    const r = rule({ triggerType: "clean_sheet", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("clean_sheet erzeugt 0× Charge bei Niederlage 0:1", () => {
    const match: MatchInput = {
      id: "synthetic_0_1",
      teamSide: "heim",
      ergebnisHeim: 0,
      ergebnisGast: 1,
      halbzeitHeim: 0,
      halbzeitGast: 0,
      events: [
        { id: "e1", type: "tor", minute: 50, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" }
      ]
    };
    const r = rule({ triggerType: "clean_sheet", amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — comeback_win", () => {
  it("erzeugt Charge wenn zur HZ hinten + am Ende vorne", () => {
    const match = loadFixture("comeback-win"); // HZ 0:2, FT 3:2
    const r = rule({ triggerType: "comeback_win", amountCents: 1500 });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(1);
  });

  it("erzeugt 0 bei normalem Sieg ohne Halbzeitrückstand", () => {
    const match = loadFixture("win-with-goals"); // HZ 2:0
    const r = rule({ triggerType: "comeback_win", amountCents: 1500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("erzeugt 0 wenn Halbzeit-Daten fehlen", () => {
    const match: MatchInput = {
      ...loadFixture("comeback-win"),
      halbzeitHeim: null,
      halbzeitGast: null
    };
    const r = rule({ triggerType: "comeback_win", amountCents: 1500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — hattrick", () => {
  it("erzeugt 1 Charge wenn ein Spieler ≥3 Tore", () => {
    const match = loadFixture("hattrick"); // Schmidt 3 Tore
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 1 Charge auch wenn 2 Spieler je 3 Tore (Rule fires einmal pro Match)", () => {
    const match: MatchInput = {
      ...loadFixture("hattrick"),
      events: [
        ...loadFixture("hattrick").events,
        { id: "x1", type: "tor", minute: 70, side: "heim", playerName: "Maier", playerId: "p_maier", source: "scraped" },
        { id: "x2", type: "tor", minute: 85, side: "heim", playerName: "Maier", playerId: "p_maier", source: "scraped" }
      ]
    };
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 0 wenn kein Spieler ≥3 Tore", () => {
    const match = loadFixture("win-with-goals"); // Schmidt 2 Tore, Maier 1
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("hattrick zählt nur Tore der eigenen Mannschaft", () => {
    const match: MatchInput = {
      id: "synthetic_ht_opp",
      teamSide: "heim",
      ergebnisHeim: 0,
      ergebnisGast: 3,
      halbzeitHeim: 0,
      halbzeitGast: 2,
      events: [
        { id: "g1", type: "tor", minute: 10, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" },
        { id: "g2", type: "tor", minute: 30, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" },
        { id: "g3", type: "tor", minute: 60, side: "gast", playerName: "X", playerId: "p_x", source: "scraped" }
      ]
    };
    const r = rule({ triggerType: "hattrick", amountCents: 2500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — goal_diff_min", () => {
  it("erzeugt Charge wenn Tordifferenz ≥ min_diff", () => {
    const match = loadFixture("clean-sheet"); // 2:0 → diff 2
    const r = rule({
      triggerType: "goal_diff_min",
      triggerParams: { minDiff: 2 },
      amountCents: 800
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 0 wenn unter min_diff", () => {
    const match = loadFixture("win-with-goals"); // 3:1 → diff 2
    const r = rule({
      triggerType: "goal_diff_min",
      triggerParams: { minDiff: 3 },
      amountCents: 800
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("min_diff feuert NICHT bei Niederlage (nur bei Sieg)", () => {
    const match: MatchInput = { ...loadFixture("win-with-goals"), teamSide: "gast" }; // gast verliert 1:3
    const r = rule({
      triggerType: "goal_diff_min",
      triggerParams: { minDiff: 2 },
      amountCents: 800
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — goals_scored_min", () => {
  it("erzeugt Charge wenn eigene Tore ≥ min_goals", () => {
    const match = loadFixture("hattrick"); // 4 Tore heim
    const r = rule({
      triggerType: "goals_scored_min",
      triggerParams: { minGoals: 4 },
      amountCents: 1200
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });

  it("erzeugt 0 wenn unter min_goals", () => {
    const match = loadFixture("win-with-goals"); // 3 Tore heim
    const r = rule({
      triggerType: "goals_scored_min",
      triggerParams: { minGoals: 5 },
      amountCents: 1200
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });
});

describe("evaluateTriggers — manual triggers", () => {
  it("special_goal feuert pro manuell-gemeldetem Spezialtor (mit subtype-filter)", () => {
    const match: MatchInput = {
      id: "synthetic_special",
      teamSide: "heim",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      halbzeitHeim: 1,
      halbzeitGast: 0,
      events: [
        { id: "s1", type: "spezial", subtype: "kopfball",  minute: 12, side: "heim", playerName: "S", playerId: "p_s", source: "manual" },
        { id: "s2", type: "spezial", subtype: "hackentor", minute: 45, side: "heim", playerName: "M", playerId: "p_m", source: "manual" },
        { id: "s3", type: "spezial", subtype: "kopfball",  minute: 70, side: "heim", playerName: "S", playerId: "p_s", source: "manual" }
      ]
    };
    const r = rule({
      triggerType: "special_goal",
      triggerParams: { subtype: "kopfball" },
      amountCents: 1000
    });
    const charges = evaluateTriggers(match, [r]);
    expect(charges).toHaveLength(2);
    charges.forEach((c) => {
      expect(c.requiresApproval).toBe(true);
      expect(c.matchEventId).not.toBeNull();
    });
  });

  it("special_goal ignoriert Events der Gegenseite", () => {
    const match: MatchInput = {
      id: "syn_opp",
      teamSide: "heim",
      ergebnisHeim: 0,
      ergebnisGast: 1,
      halbzeitHeim: 0,
      halbzeitGast: 1,
      events: [
        { id: "x", type: "spezial", subtype: "kopfball", minute: 20, side: "gast", playerName: "G", playerId: "p_g", source: "manual" }
      ]
    };
    const r = rule({ triggerType: "special_goal", triggerParams: { subtype: "kopfball" }, amountCents: 500 });
    expect(evaluateTriggers(match, [r])).toHaveLength(0);
  });

  it("yellow_card / red_card feuern pro karte-Event mit subtype", () => {
    const match: MatchInput = {
      id: "syn_cards",
      teamSide: "heim",
      ergebnisHeim: 1,
      ergebnisGast: 1,
      halbzeitHeim: 0,
      halbzeitGast: 0,
      events: [
        { id: "k1", type: "karte", subtype: "gelb", minute: 30, side: "heim", playerName: "A", playerId: "p_a", source: "manual" },
        { id: "k2", type: "karte", subtype: "rot",  minute: 80, side: "heim", playerName: "B", playerId: "p_b", source: "manual" }
      ]
    };
    const yellow = rule({ triggerType: "yellow_card", amountCents: 100 });
    const red = rule({ triggerType: "red_card", amountCents: 500 });
    const charges = evaluateTriggers(match, [yellow, red]);
    expect(charges.filter((c) => c.triggerType === "yellow_card")).toHaveLength(1);
    expect(charges.filter((c) => c.triggerType === "red_card")).toHaveLength(1);
    expect(charges.every((c) => c.requiresApproval)).toBe(true);
  });

  it("custom feuert pro Event mit type=spezial + matching subtype-Pattern", () => {
    const match: MatchInput = {
      id: "syn_custom",
      teamSide: "heim",
      ergebnisHeim: 2,
      ergebnisGast: 0,
      halbzeitHeim: 1,
      halbzeitGast: 0,
      events: [
        { id: "c1", type: "spezial", subtype: "bizeps-tor", minute: 50, side: "heim", playerName: "X", playerId: "p_x", source: "manual" }
      ]
    };
    const r = rule({
      triggerType: "custom",
      triggerParams: { subtype: "bizeps-tor" },
      amountCents: 200
    });
    expect(evaluateTriggers(match, [r])).toHaveLength(1);
  });
});

describe("evaluateTriggers — multiple pledge-rules in einem Match", () => {
  it("aggregiert Charges aus 4 unterschiedlichen Rules korrekt", () => {
    const match = loadFixture("comeback-win"); // heim 3:2, HZ 0:2; Schmidt 2 Tore, Maier 1, Weber/Becker gegnerische Tore

    const goalTotal = rule({ id: "rA", triggerType: "goal_total", amountCents: 500 });
    const winRule = rule({ id: "rB", triggerType: "win", amountCents: 1000 });
    const comeback = rule({ id: "rC", triggerType: "comeback_win", amountCents: 2000 });
    const schmidtGoals = rule({
      id: "rD",
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 300
    });

    const charges = evaluateTriggers(match, [goalTotal, winRule, comeback, schmidtGoals]);

    // 3 Tore (heim) → 3 goal_total + 1 win + 1 comeback_win + 2 Schmidt-Tore = 7 charges
    expect(charges).toHaveLength(7);

    const total = charges.reduce((acc, c) => acc + c.amountCents, 0);
    expect(total).toBe(3 * 500 + 1000 + 2000 + 2 * 300);
  });

  it("zwei Rules mit unterschiedlichen Caps werden unabhängig gekappt", () => {
    const match = loadFixture("hattrick"); // 4 Tore heim, Schmidt 3, Maier 1
    const allGoals = rule({
      id: "rA",
      triggerType: "goal_total",
      amountCents: 500,
      perMatchCapCents: 1000 // → 2 charges (1000 ≤ cap), 3. würde 1500 > 1000 sein → stop
    });
    const schmidtGoals = rule({
      id: "rB",
      triggerType: "goal_by_player",
      triggerParams: { playerId: "p_schmidt" },
      amountCents: 400,
      perMatchCapCents: 1000 // 2 charges (800 ≤ 1000), 3. wäre 1200 > 1000 → stop
    });
    const charges = evaluateTriggers(match, [allGoals, schmidtGoals]);
    expect(charges.filter((c) => c.pledgeRuleId === "rA")).toHaveLength(2);
    expect(charges.filter((c) => c.pledgeRuleId === "rB")).toHaveLength(2);
  });
});
