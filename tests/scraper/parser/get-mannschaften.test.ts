import { describe, it, expect } from "vitest";
import {
  withMockedBrowser,
  loadFixtureJson,
  fixtureExists,
  htmlFixtureExists,
} from "../../setup/playwright-mocks";
import {
  getMannschaften,
  type VereinHit,
  type MannschaftHit,
} from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("getMannschaften parser", () => {
  for (const club of FIXTURE_CLUBS) {
    it(`parses team list for ${club.key}`, async () => {
      const searchRel = `${club.key}/search.json`;
      const mannschaftenJsonRel = `${club.key}/mannschaften.json`;
      const mannschaftenHtmlRel = `${club.key}/mannschaften.html`;

      if (
        !(await fixtureExists(searchRel)) ||
        !(await fixtureExists(mannschaftenJsonRel)) ||
        !(await htmlFixtureExists(mannschaftenHtmlRel))
      ) {
        return; // partial fixtures — skip
      }

      const search = await loadFixtureJson<VereinHit[]>(searchRel);
      const verein = search[0];
      const expected = await loadFixtureJson<MannschaftHit[]>(
        mannschaftenJsonRel,
      );

      const actual = await withMockedBrowser(
        [
          {
            matchUrl: new RegExp(`fussball\\.de/verein/${verein.slug}`),
            htmlPath: mannschaftenHtmlRel,
          },
        ],
        async () => getMannschaften(verein.vereinId, verein.slug),
      );

      // HTML may contain more teams than the captured JSON (e.g. inactive teams
      // the capture script filtered out) — assert containment, not exact count.
      expect(actual.length).toBeGreaterThanOrEqual(expected.length);
      for (const e of expected) {
        expect(actual.find((a) => a.teamId === e.teamId)).toBeTruthy();
      }
    }, 60_000);

    it(`team rows have plausible saison format for ${club.key}`, async () => {
      const mannschaftenJsonRel = `${club.key}/mannschaften.json`;
      if (!(await fixtureExists(mannschaftenJsonRel))) return;

      const expected = await loadFixtureJson<MannschaftHit[]>(
        mannschaftenJsonRel,
      );
      for (const m of expected) {
        expect(m.saison).toMatch(/^\d{4}$|^\d{2}\/\d{2}$/);
      }
    });
  }
});
