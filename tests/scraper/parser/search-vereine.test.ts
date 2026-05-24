import { describe, it, expect } from "vitest";
import {
  withMockedBrowser,
  loadFixtureJson,
  fixtureExists,
  htmlFixtureExists,
} from "../../setup/playwright-mocks";
import { searchVereine, type VereinHit } from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("searchVereine parser", () => {
  for (const club of FIXTURE_CLUBS) {
    it(`parses search hits for ${club.key}`, async () => {
      const jsonRel = `${club.key}/search.json`;
      const htmlRel = `${club.key}/search.html`;
      if (!(await fixtureExists(jsonRel)) || !(await htmlFixtureExists(htmlRel))) {
        return; // fixtures not captured for this club yet — skip silently
      }

      const expected = await loadFixtureJson<VereinHit[]>(jsonRel);
      const actual = await withMockedBrowser(
        [{ matchUrl: /fussball\.de\/suche/, htmlPath: htmlRel }],
        async () => searchVereine(club.searchTerm),
      );

      expect(actual.length).toBeGreaterThanOrEqual(1);
      expect(actual[0]).toMatchObject({
        name: expect.any(String),
        slug: expect.any(String),
        vereinId: expect.stringMatching(club.expectedVereinIdPattern),
      });
      // Order-tolerant: every expected vereinId appears in actual
      for (const e of expected) {
        expect(actual.find((a) => a.vereinId === e.vereinId)).toBeTruthy();
      }
    }, 60_000);
  }
});
