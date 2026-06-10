import { describe, it, expect } from "vitest";
import {
  withMockedBrowser,
  loadFixtureJson,
  fixtureExists,
  htmlFixtureExists,
} from "../../setup/playwright-mocks";
import {
  getKader,
  type MannschaftHit,
  type KaderPlayer,
} from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("getKader parser", () => {
  for (const club of FIXTURE_CLUBS) {
    for (const teamCfg of club.teams) {
      for (const saison of teamCfg.saisons) {
        it(`parses kader for ${club.key}/${teamCfg.key}/saison${saison}`, async () => {
          const mannschaftenRel = `${club.key}/mannschaften.json`;
          const kaderJsonRel = `${club.key}/${teamCfg.key}-kader-saison${saison}.json`;
          const kaderHtmlRel = `${club.key}/${teamCfg.key}-kader-saison${saison}.html`;

          if (
            !(await fixtureExists(mannschaftenRel)) ||
            !(await fixtureExists(kaderJsonRel)) ||
            !(await htmlFixtureExists(kaderHtmlRel))
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

          const expected = await loadFixtureJson<KaderPlayer[]>(kaderJsonRel);

          const actual = await withMockedBrowser(
            [
              {
                matchUrl: new RegExp(`fussball\\.de/mannschaft/${team.slug}`),
                htmlPath: kaderHtmlRel,
              },
            ],
            async () => getKader(team.teamId, team.slug, saison),
          );

          expect(actual.length).toBe(expected.length);
          for (const p of actual) {
            expect(p.name).toBeTruthy();
            expect(p.name.length).toBeGreaterThan(1);
          }
        }, 120_000);
      }
    }
  }

  // Regression (2026-06-10): Amateur-Mannschaftsseiten haben keine Kader-Sektion.
  // Früher matchte die .column-name-Fallback-Strategie dort Match-Bericht-Teaser
  // ("Sprecakovic glänzt als dreifacher Torschütze") + Ergebnis-Zellen und gab
  // Überschriften als "Spieler" zurück. Eine Seite ohne spielerprofil-Links MUSS
  // jetzt einen LEEREN Kader liefern, nicht Müll.
  it("liefert leeren Kader bei Seite ohne Spielerprofil-Links (kein column-name-Garbage)", async () => {
    const result = await withMockedBrowser(
      [
        {
          matchUrl: /fussball\.de\/mannschaft\//,
          htmlPath: "negative/kader-headlines-only.html",
        },
      ],
      async () => getKader("FAKETEAMID0000000000", "fake-team-slug", "2526"),
    );
    expect(result).toEqual([]);
  }, 120_000);
});
