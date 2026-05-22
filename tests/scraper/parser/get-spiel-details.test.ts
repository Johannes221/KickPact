import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import {
  withMockedBrowser,
  loadFixtureJson,
  fixtureExists,
} from "../../setup/playwright-mocks";
import {
  getSpielDetails,
  type MannschaftHit,
} from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS, JSON_ROOT } from "../../fixtures/scraper/config";

type ExpectedSpielDetails = {
  matchId?: string;
  spielId?: string;
  halbzeit: { heim: number | null; gast: number | null } | null;
  events: Array<{ minute: number; type?: string; typ?: string; side: "heim" | "gast" }>;
};

async function listDetailFixtures(
  clubKey: string,
  teamKey: string,
): Promise<string[]> {
  const dir = path.join(JSON_ROOT, clubKey);
  try {
    const files = await fs.readdir(dir);
    return files.filter(
      (f) => f.startsWith(`${teamKey}-spiel-`) && f.endsWith(".json"),
    );
  } catch {
    return [];
  }
}

describe("getSpielDetails parser", () => {
  for (const club of FIXTURE_CLUBS) {
    for (const teamCfg of club.teams) {
      it(`parses spieldetails for ${club.key}/${teamCfg.key}`, async () => {
        const fixtures = await listDetailFixtures(club.key, teamCfg.key);
        if (fixtures.length === 0) return;

        const mannschaftenRel = `${club.key}/mannschaften.json`;
        if (!(await fixtureExists(mannschaftenRel))) return;
        const mannschaften = await loadFixtureJson<MannschaftHit[]>(
          mannschaftenRel,
        );
        const firstToken = teamCfg.searchName.toLowerCase().split(" ")[0];
        const team = mannschaften.find((m) =>
          m.name.toLowerCase().includes(firstToken),
        );
        if (!team) return;

        for (const file of fixtures) {
          const spielId = file
            .replace(`${teamCfg.key}-spiel-`, "")
            .replace(".json", "");
          const htmlRel = `${club.key}/${teamCfg.key}-spiel-${spielId}.html`;

          const expected = await loadFixtureJson<ExpectedSpielDetails>(
            `${club.key}/${file}`,
          );

          const actual = await withMockedBrowser(
            [
              {
                matchUrl: new RegExp(`fussball\\.de/spiel/.*spiel/${spielId}`),
                htmlPath: htmlRel,
              },
            ],
            async () => getSpielDetails(spielId, team.slug),
          );

          expect(actual.events.length).toBe(expected.events.length);
          for (let i = 1; i < actual.events.length; i++) {
            const cur = actual.events[i].minute;
            const prev = actual.events[i - 1].minute;
            // Both may be null; only enforce ordering when defined
            if (typeof cur === "number" && typeof prev === "number") {
              expect(cur).toBeGreaterThanOrEqual(prev);
            }
          }
          for (const e of actual.events) {
            expect(["heim", "gast", "unbekannt"]).toContain(e.side);
            if (typeof e.minute === "number") {
              expect(e.minute).toBeGreaterThanOrEqual(0);
              expect(e.minute).toBeLessThanOrEqual(130);
            }
          }
        }
      }, 180_000);
    }
  }
});
