// tests/scraper/engine/_helpers.ts
import fs from "node:fs";
import path from "node:path";
import { JSON_ROOT } from "../../fixtures/scraper/config";
import type { MatchInput, PledgeRuleInput } from "../../../lib/crawler/triggers";
import { detectTeamSide } from "../../../lib/crawler/team-side";

type RawMatchFixture = {
  matchId?: string;
  spielId?: string;
  halbzeit: { heim: number | null; gast: number | null } | null;
  events: Array<{
    minute: number | null;
    type: string;
    subtype?: string | null;
    side: "heim" | "gast";
    spielerId?: string | null;
    spielerName?: string | null;
    playerId?: string | null;
    playerName?: string | null;
    source?: "scraped" | "manual";
  }>;
  heimName: string;
  gastName: string;
  ergebnisHeim: number;
  ergebnisGast: number;
};

/**
 * Load a Spiel-Detail-Fixture (JSON written by the capture script) and map it
 * onto the engine's `MatchInput` shape.
 *
 * Fixture path: `tests/fixtures/scraper/json/<club>/<team>-spiel-<spielId>.json`
 *
 * If no `playerId/playerName` fields are present, the German `spielerId/spielerName`
 * keys are used (capture-script naming).
 */
export function loadMatchFixture(
  clubKey: string,
  teamKey: string,
  spielId: string,
  ownTeamName: string
): MatchInput {
  const file = path.join(JSON_ROOT, clubKey, `${teamKey}-spiel-${spielId}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as RawMatchFixture;

  const matchId = data.matchId ?? data.spielId ?? spielId;
  const teamSide = detectTeamSide(ownTeamName, data.heimName);

  return {
    id: matchId,
    teamSide,
    ergebnisHeim: data.ergebnisHeim,
    ergebnisGast: data.ergebnisGast,
    halbzeitHeim: data.halbzeit?.heim ?? null,
    halbzeitGast: data.halbzeit?.gast ?? null,
    events: data.events.map((e, i) => ({
      id: `e_${i}`,
      minute: e.minute ?? null,
      type: e.type as MatchInput["events"][number]["type"],
      subtype: e.subtype ?? null,
      side: e.side,
      playerId: e.playerId ?? e.spielerId ?? null,
      playerName: e.playerName ?? e.spielerName ?? null,
      source: e.source ?? "scraped",
    })),
  };
}

/**
 * Factory for engine PledgeRuleInput with sane defaults. Override anything
 * via `overrides`.
 */
export function rule(overrides: Partial<PledgeRuleInput> = {}): PledgeRuleInput {
  return {
    id: "r_test",
    pledgeId: "p_test",
    triggerType: "goal_total",
    triggerParams: {},
    amountCents: 500,
    perMatchCapCents: null,
    ...overrides,
  };
}

/**
 * Return all `spielId`s that have a captured fixture for `<club>/<team>`.
 *
 * Returns an empty array if either the club-directory doesn't exist or no
 * spiel-fixtures are present yet. Tests should gracefully skip in that case.
 */
export function listMatchFixtures(clubKey: string, teamKey: string): string[] {
  const dir = path.join(JSON_ROOT, clubKey);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${teamKey}-spiel-`) && f.endsWith(".json"))
    .map((f) => f.replace(`${teamKey}-spiel-`, "").replace(".json", ""))
    .sort();
}
