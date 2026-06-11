/**
 * Hattrick/Comeback mit manueller Evidenz (Audit 2026-06-11 / Phase 2 / C3).
 *
 * Outcome-Trigger, deren Hit von TOR-EVENTS abhängt (hattrick: Spieler-Tally,
 * comeback_win: Chronologie), wurden bisher IMMER auto-confirmed — auch wenn
 * die entscheidenden Tore manuell vom Verein gemeldet wurden. Ein Verein
 * konnte sich so per Phantom-Minuten/Spieler-Angaben einen Hattrick oder ein
 * Comeback zusammenbauen. Jetzt: sobald ein beitragendes Tor-Event
 * source='manual' ist → requiresApproval=true; rein gescrapte Evidenz bleibt
 * Auto-Confirm.
 */
import { describe, expect, it } from "vitest";
import { evaluateTriggers, type MatchInput, type PledgeRuleInput } from "@/lib/crawler/triggers";

function rule(triggerType: "hattrick" | "comeback_win"): PledgeRuleInput {
  return {
    id: "r1",
    pledgeId: "p1",
    triggerType,
    triggerParams: {},
    amountCents: 1000,
    perMatchCapCents: null,
    capCents: null,
    capPeriod: null
  };
}

function goal(
  id: string,
  opts: {
    side?: "heim" | "gast";
    minute?: number;
    player?: string;
    source?: "scraped" | "manual";
  } = {}
): MatchInput["events"][number] {
  return {
    id,
    type: "tor",
    subtype: null,
    minute: opts.minute ?? 10,
    side: opts.side ?? "heim",
    playerName: opts.player ?? null,
    playerId: null,
    source: opts.source ?? "scraped"
  };
}

describe("hattrick — manuelle Evidenz (C3)", () => {
  function hattrickMatch(thirdGoalSource: "scraped" | "manual"): MatchInput {
    return {
      id: "m1",
      teamSide: "heim",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      halbzeitHeim: null,
      halbzeitGast: null,
      events: [
        goal("g1", { minute: 10, player: "Max" }),
        goal("g2", { minute: 30, player: "Max" }),
        goal("g3", { minute: 70, player: "Max", source: thirdGoalSource })
      ]
    };
  }

  it("rein gescrapte Tore → Auto-Confirm (requiresApproval=false)", () => {
    const proposals = evaluateTriggers(hattrickMatch("scraped"), [rule("hattrick")]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].requiresApproval).toBe(false);
  });

  it("ein manuelles Tor in der Evidenz → requiresApproval=true", () => {
    const proposals = evaluateTriggers(hattrickMatch("manual"), [rule("hattrick")]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].requiresApproval).toBe(true);
  });
});

describe("comeback_win — manuelle Evidenz (C3)", () => {
  function comebackMatch(opponentGoalSource: "scraped" | "manual"): MatchInput {
    return {
      id: "m2",
      teamSide: "heim",
      ergebnisHeim: 2,
      ergebnisGast: 1,
      halbzeitHeim: null,
      halbzeitGast: null,
      events: [
        // 0:1-Rückstand, dann Comeback.
        goal("og1", { side: "gast", minute: 5, source: opponentGoalSource }),
        goal("g1", { minute: 60 }),
        goal("g2", { minute: 85 })
      ]
    };
  }

  it("rein gescrapte Chronologie → Auto-Confirm", () => {
    const proposals = evaluateTriggers(comebackMatch("scraped"), [rule("comeback_win")]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].requiresApproval).toBe(false);
  });

  it("manuelles Tor (auch Gegner-Seite — beeinflusst die Chronologie) → requiresApproval=true", () => {
    const proposals = evaluateTriggers(comebackMatch("manual"), [rule("comeback_win")]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].requiresApproval).toBe(true);
  });
});
