/**
 * Tests für das URL↔Dateiname-Mapping der Spiele-Pagination-Fixtures
 * (tests/fixtures/scraper/spiele-pages.ts) und den fetchHtml-Capture-Hook.
 *
 * getSpiele paginiert über vier AJAX-Strategien (prev/next × ohne/mit saison,
 * jeweils mit index-Seiten). Capture-Script und get-spiele.test.ts müssen
 * dieselbe Abbildung AJAX-URL ↔ Fixture-Datei verwenden — sonst serviert der
 * Test die falsche Seite und die Pagination divergiert vom Live-Lauf.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  parseAjaxTeamGamesUrl,
  spielePageFileName,
  parseSpielePageFileName,
  spielePageUrlRegex,
} from "../../fixtures/scraper/spiele-pages";
import { HTML_ROOT } from "../../fixtures/scraper/config";
import { getSpiele, setFetchHtmlObserver } from "../../../lib/crawler/fussballde";

// getSpiele holt HTML über undici-fetch (NICHT Browser, NICHT globales fetch)
// — siehe tests/setup/fetch-mocks.ts.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

const TEAM_ID = "011MIBJVVC000000VTVG0001VTR8C1K7";
const BASE = `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${TEAM_ID}`;
const BASE_NEXT = `https://www.fussball.de/ajax.team.next.games/-/mode/PAGE/team-id/${TEAM_ID}`;

describe("parseAjaxTeamGamesUrl", () => {
  it("parst Seite 0 ohne saison", () => {
    expect(parseAjaxTeamGamesUrl(BASE)).toEqual({
      kind: "prev",
      teamId: TEAM_ID,
      withSaison: false,
      index: 0,
    });
  });

  it("parst index-Seiten ohne saison", () => {
    expect(parseAjaxTeamGamesUrl(`${BASE}/index/3`)).toEqual({
      kind: "prev",
      teamId: TEAM_ID,
      withSaison: false,
      index: 3,
    });
  });

  it("parst Seite 0 mit saison", () => {
    expect(parseAjaxTeamGamesUrl(`${BASE}/saison/2526`)).toEqual({
      kind: "prev",
      teamId: TEAM_ID,
      withSaison: true,
      index: 0,
    });
  });

  it("parst index-Seiten mit saison und kind=next", () => {
    expect(parseAjaxTeamGamesUrl(`${BASE_NEXT}/saison/2425/index/2`)).toEqual({
      kind: "next",
      teamId: TEAM_ID,
      withSaison: true,
      index: 2,
    });
  });

  it("liefert null für Nicht-AJAX-URLs (Detailseite, Spielerprofil)", () => {
    expect(
      parseAjaxTeamGamesUrl("https://www.fussball.de/spiel/foo/-/spiel/02ABC"),
    ).toBeNull();
    expect(
      parseAjaxTeamGamesUrl(
        "https://www.fussball.de/spielerprofil/-/player-id/ABCDEF",
      ),
    ).toBeNull();
  });
});

describe("spielePageFileName ↔ parseSpielePageFileName", () => {
  it("erzeugt die dokumentierten Dateinamen", () => {
    expect(
      spielePageFileName("herren1", "2526", {
        kind: "prev",
        withSaison: false,
        index: 0,
      }),
    ).toBe("herren1-spiele-saison2526-prev-p0.html");
    expect(
      spielePageFileName("a-junioren", "2425", {
        kind: "next",
        withSaison: true,
        index: 2,
      }),
    ).toBe("a-junioren-spiele-saison2425-next-saison-p2.html");
  });

  it("ist mit parseSpielePageFileName ein Roundtrip (auch bei Dash im teamKey)", () => {
    for (const teamKey of ["herren1", "a-junioren"]) {
      for (const saison of ["2526", "2425"]) {
        for (const kind of ["prev", "next"] as const) {
          for (const withSaison of [false, true]) {
            for (const index of [0, 1, 7]) {
              const file = spielePageFileName(teamKey, saison, {
                kind,
                withSaison,
                index,
              });
              expect(parseSpielePageFileName(file)).toEqual({
                teamKey,
                saison,
                kind,
                withSaison,
                index,
              });
            }
          }
        }
      }
    }
  });

  it("liefert null für fremde Dateien", () => {
    expect(parseSpielePageFileName("search.html")).toBeNull();
    expect(parseSpielePageFileName("herren1-spiel-02ABC.html")).toBeNull();
    expect(
      parseSpielePageFileName("herren1-spiele-saison2526.json"),
    ).toBeNull();
  });
});

describe("spielePageUrlRegex", () => {
  const variants = [
    { page: { kind: "prev", withSaison: false, index: 0 } as const, url: BASE },
    {
      page: { kind: "prev", withSaison: false, index: 1 } as const,
      url: `${BASE}/index/1`,
    },
    {
      page: { kind: "prev", withSaison: true, index: 0 } as const,
      url: `${BASE}/saison/2526`,
    },
    {
      page: { kind: "prev", withSaison: true, index: 1 } as const,
      url: `${BASE}/saison/2526/index/1`,
    },
    {
      page: { kind: "next", withSaison: false, index: 0 } as const,
      url: BASE_NEXT,
    },
    {
      page: { kind: "next", withSaison: true, index: 2 } as const,
      url: `${BASE_NEXT}/saison/2526/index/2`,
    },
  ];

  it("matcht GENAU die eigene URL-Variante (keine Kollisionen)", () => {
    for (const a of variants) {
      const re = spielePageUrlRegex(TEAM_ID, "2526", a.page);
      for (const b of variants) {
        expect(re.test(b.url)).toBe(a === b);
      }
    }
  });

  it("matcht nicht für fremde teamId oder saison", () => {
    const re = spielePageUrlRegex(TEAM_ID, "2526", {
      kind: "prev",
      withSaison: true,
      index: 0,
    });
    expect(re.test(`${BASE}/saison/2425`)).toBe(false);
    expect(
      re.test(
        `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/OTHER/saison/2526`,
      ),
    ).toBe(false);
  });
});

describe("setFetchHtmlObserver", () => {
  afterEach(() => setFetchHtmlObserver(null));

  it("liefert für jeden fetchHtml-Erfolg URL + rohes HTML (Capture-Grundlage)", async () => {
    const seen: Array<{ url: string; html: string }> = [];
    setFetchHtmlObserver((url, html) => seen.push({ url, html }));

    await withMockedFetch(
      [
        { matchUrl: /ajax\.team\.prev\.games/, htmlPath: "synthetic/prev-games.html" },
        { matchUrl: /ajax\.team\.next\.games/, htmlPath: "synthetic/next-games.html" },
      ],
      () => getSpiele(TEAM_ID, "sv-musterhausen", "1920"),
    );

    const prevHits = seen.filter((s) => /ajax\.team\.prev\.games/.test(s.url));
    expect(prevHits.length).toBeGreaterThan(0);
    const fixture = fs.readFileSync(
      path.join(HTML_ROOT, "synthetic/prev-games.html"),
      "utf-8",
    );
    expect(prevHits[0].html).toBe(fixture);
    // Jede beobachtete URL muss dem AJAX-Schema entsprechen — kein anderer
    // Fetch-Typ läuft in getSpiele.
    for (const s of seen) {
      expect(parseAjaxTeamGamesUrl(s.url)).not.toBeNull();
    }
  }, 120_000);
});
