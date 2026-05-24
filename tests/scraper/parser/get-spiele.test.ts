import { describe, it, expect } from "vitest";
import {
  withMockedBrowser,
  loadFixtureJson,
  fixtureExists,
  htmlFixtureExists,
} from "../../setup/playwright-mocks";
import {
  getSpiele,
  type MannschaftHit,
  type SpielListItem,
} from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("getSpiele parser", () => {
  for (const club of FIXTURE_CLUBS) {
    for (const teamCfg of club.teams) {
      for (const saison of teamCfg.saisons) {
        it(`parses spielplan for ${club.key}/${teamCfg.key}/saison${saison}`, async () => {
          const mannschaftenRel = `${club.key}/mannschaften.json`;
          const spieleJsonRel = `${club.key}/${teamCfg.key}-spiele-saison${saison}.json`;
          const spieleHtmlRel = `${club.key}/${teamCfg.key}-spiele-saison${saison}.html`;

          if (
            !(await fixtureExists(mannschaftenRel)) ||
            !(await fixtureExists(spieleJsonRel)) ||
            !(await htmlFixtureExists(spieleHtmlRel))
          ) {
            return;
          }

          const mannschaften = await loadFixtureJson<MannschaftHit[]>(
            mannschaftenRel,
          );
          const firstToken = teamCfg.searchName.toLowerCase().split(" ")[0];
          const team = mannschaften.find((m) =>
            m.name.toLowerCase().includes(firstToken),
          );
          if (!team) return;

          const expected = await loadFixtureJson<SpielListItem[]>(spieleJsonRel);

          const actual = await withMockedBrowser(
            [
              {
                matchUrl: new RegExp(
                  `ajax\\.team\\.prev\\.games.*team-id/${team.teamId}`,
                ),
                htmlPath: spieleHtmlRel,
              },
              {
                matchUrl: new RegExp(`fussball\\.de/mannschaft/${team.slug}`),
                htmlPath: spieleHtmlRel,
              },
            ],
            async () => getSpiele(team.teamId, team.slug, saison),
          );

          expect(actual.length).toBe(expected.length);
          for (const e of expected) {
            expect(actual.find((a) => a.spielId === e.spielId)).toBeTruthy();
          }
          const ids = actual.map((a) => a.spielId);
          expect(new Set(ids).size).toBe(ids.length);
          for (const a of actual) {
            expect(a.datum).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
          }
        }, 120_000);
      }
    }
  }
});
