import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "../../../lib/crawler/triggers";
import { loadMatchFixture, rule, listMatchFixtures } from "./_helpers";

/**
 * Auto-trigger tests against captured real-data match fixtures.
 *
 * Each scenario is parametrised by club/team and the own-team display name
 * (so `detectTeamSide` can resolve heim/gast). Tests skip gracefully when no
 * spiel-fixtures are present for that team — at the time of writing only
 * Dossenheim's herren1/herren2/herren3 are expected; other clubs land later.
 */
const SCENARIOS = [
  { club: "dossenheim", team: "herren1", ownName: "FC Sportfreunde 1910 Dossenheim" },
  { club: "dossenheim", team: "herren2", ownName: "FC Sportfreunde 1910 Dossenheim 2" },
  { club: "dossenheim", team: "herren3", ownName: "FC Sportfreunde 1910 Dossenheim 3" },
  { club: "heidelberg-kirchheim", team: "herren1", ownName: "SG Heidelberg-Kirchheim" },
  { club: "handschuhsheim", team: "herren1", ownName: "TSV Handschuhsheim" },
  { club: "schriesheim", team: "herren1", ownName: "SG Schriesheim" },
];

describe("auto triggers — real fixtures", () => {
  for (const s of SCENARIOS) {
    const ids = listMatchFixtures(s.club, s.team);

    describe(`${s.club}/${s.team}`, () => {
      if (ids.length === 0) {
        it.skip(`no fixtures captured yet for ${s.club}/${s.team}`, () => {});
        return;
      }

      it("goal_total emits one charge per own goal", () => {
        const match = loadMatchFixture(s.club, s.team, ids[0], s.ownName);
        const ownGoals = match.events.filter(
          (e) => e.type === "tor" && e.side === match.teamSide
        ).length;
        const proposals = evaluateTriggers(match, [
          rule({ triggerType: "goal_total", amountCents: 100 }),
        ]);
        expect(proposals.length).toBe(ownGoals);
        expect(proposals.every((p) => p.amountCents === 100)).toBe(true);
        expect(proposals.every((p) => p.requiresApproval === false)).toBe(true);
      });

      it("goal_total respects per_match_cap", () => {
        const match = loadMatchFixture(s.club, s.team, ids[0], s.ownName);
        const proposals = evaluateTriggers(match, [
          rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 250 }),
        ]);
        const sum = proposals.reduce((acc, p) => acc + p.amountCents, 0);
        expect(sum).toBeLessThanOrEqual(250);
      });

      it("win / loss / draw — exactly one of three fires per match", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const w = evaluateTriggers(m, [rule({ triggerType: "win", amountCents: 100 })]).length;
          const l = evaluateTriggers(m, [rule({ triggerType: "loss", amountCents: 100 })]).length;
          const d = evaluateTriggers(m, [rule({ triggerType: "draw", amountCents: 100 })]).length;
          expect(w + l + d).toBe(1);
        }
      });

      it("clean_sheet only fires on win with 0 opponent goals", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const own = m.teamSide === "heim" ? m.ergebnisHeim : m.ergebnisGast;
          const opp = m.teamSide === "heim" ? m.ergebnisGast : m.ergebnisHeim;
          const props = evaluateTriggers(m, [
            rule({ triggerType: "clean_sheet", amountCents: 200 }),
          ]);
          if (own > opp && opp === 0) expect(props.length).toBe(1);
          else expect(props.length).toBe(0);
        }
      });

      it("hattrick fires only when a player scores >=3 own-side goals", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const playerGoals = new Map<string, number>();
          for (const e of m.events) {
            if (e.type === "tor" && e.side === m.teamSide) {
              const key = e.playerId ?? e.playerName ?? "unknown";
              playerGoals.set(key, (playerGoals.get(key) ?? 0) + 1);
            }
          }
          const hasHattrick = Array.from(playerGoals.values()).some((c) => c >= 3);
          const props = evaluateTriggers(m, [
            rule({ triggerType: "hattrick", amountCents: 1000 }),
          ]);
          if (hasHattrick) expect(props.length).toBeGreaterThanOrEqual(1);
          else expect(props.length).toBe(0);
        }
      });

      it("goal_diff_min fires when (own - opp) >= minDiff AND team won", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const own = m.teamSide === "heim" ? m.ergebnisHeim : m.ergebnisGast;
          const opp = m.teamSide === "heim" ? m.ergebnisGast : m.ergebnisHeim;
          const props = evaluateTriggers(m, [
            rule({
              triggerType: "goal_diff_min",
              amountCents: 500,
              triggerParams: { minDiff: 2 },
            }),
          ]);
          if (own > opp && own - opp >= 2) expect(props.length).toBe(1);
          else expect(props.length).toBe(0);
        }
      });

      it("goals_scored_min fires when own goals >= minGoals", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const own = m.teamSide === "heim" ? m.ergebnisHeim : m.ergebnisGast;
          const props = evaluateTriggers(m, [
            rule({
              triggerType: "goals_scored_min",
              amountCents: 500,
              triggerParams: { minGoals: 3 },
            }),
          ]);
          if (own >= 3) expect(props.length).toBe(1);
          else expect(props.length).toBe(0);
        }
      });
    });
  }
});
