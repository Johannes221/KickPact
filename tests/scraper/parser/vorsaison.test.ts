/**
 * Fixture-Replay- und Edge-Case-Tests für getVorsaisonSpiele (Vorsaison-
 * Backfill über ajax.team.matchplan).
 *
 * Replay: rohe Matchplan-JSON-Antwort (html/<club>/<teamKey>-matchplan-
 * saison<YYYY>.json) + Score-Font (fonts/<id>.ttf) + erwartetes Ergebnis
 * (json/<club>/<teamKey>-vorsaison-saison<YYYY>.json) stammen aus DEMSELBEN
 * Capture-Lauf (scripts/fixtures/capture-vorsaison.ts).
 *
 * Memory-Falle: der Crawler fetcht über undici — withMockedBrowser wäre ein
 * No-Op. Deshalb undici-Mock (tests/setup/fetch-mocks.ts) wie in den anderen
 * Parser-Tests. Der Score-Font wird per injizierbarem Loader aus der
 * eingecheckten TTF geladen (Muster aus displayed-result.test.ts).
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  getVorsaisonSpiele,
  matchplanUrl,
  type VorsaisonSpiel,
} from "../../../lib/crawler/vorsaison";
import type {
  ScoreFont,
  ScoreFontLoader,
} from "../../../lib/crawler/score-font";
import {
  FIXTURES_ROOT,
  HTML_ROOT,
  JSON_ROOT,
} from "../../fixtures/scraper/config";
import { saisonStartDate } from "../../../lib/utils/saison";

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

const FONTS_ROOT = path.join(FIXTURES_ROOT, "fonts");

/** Loader aus den eingecheckten TTFs: fonts/<obfuscationId>.ttf */
const fixtureFontLoader: ScoreFontLoader = async (id) => {
  const p = path.join(FONTS_ROOT, `${id}.ttf`);
  if (!fs.existsSync(p)) return null;
  return fontkit.create(fs.readFileSync(p)) as unknown as ScoreFont;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type VorsaisonFixture = {
  teamId: string;
  saison: string;
  spiele: VorsaisonSpiel[];
};

/** Alle Team/Saison-Paare, für die Replay-Fixtures eingecheckt sind. */
function listVorsaisonFixtures(): Array<{
  clubKey: string;
  teamKey: string;
  saison: string;
  rawPath: string;
  fixture: VorsaisonFixture;
}> {
  const out: Array<{
    clubKey: string;
    teamKey: string;
    saison: string;
    rawPath: string;
    fixture: VorsaisonFixture;
  }> = [];
  let clubs: string[];
  try {
    clubs = fs.readdirSync(JSON_ROOT);
  } catch {
    return out;
  }
  for (const clubKey of clubs) {
    let files: string[];
    try {
      files = fs.readdirSync(path.join(JSON_ROOT, clubKey));
    } catch {
      continue;
    }
    for (const f of files) {
      const m = f.match(/^(.+)-vorsaison-saison(\d{4})\.json$/);
      if (!m) continue;
      const rawPath = `${clubKey}/${m[1]}-matchplan-saison${m[2]}.json`;
      if (!fs.existsSync(path.join(HTML_ROOT, rawPath))) continue;
      out.push({
        clubKey,
        teamKey: m[1],
        saison: m[2],
        rawPath,
        fixture: JSON.parse(
          fs.readFileSync(path.join(JSON_ROOT, clubKey, f), "utf-8"),
        ) as VorsaisonFixture,
      });
    }
  }
  return out;
}

const fixtures = listVorsaisonFixtures();

describe("getVorsaisonSpiele (Fixture-Replay)", () => {
  // Sichtbarer Skip statt stilles Grün, solange keine Fixtures gecaptured sind.
  it.skipIf(fixtures.length > 0)(
    "SKIP-Marker: keine Vorsaison-Fixtures gecaptured (scripts/fixtures/capture-vorsaison.ts)",
    () => {
      expect(fixtures.length).toBe(0);
    },
  );

  for (const fx of fixtures) {
    it(`replays ${fx.clubKey}/${fx.teamKey}/saison${fx.saison}`, async () => {
      const start = saisonStartDate(fx.saison)!;
      const startYear = start.getFullYear();
      const url = matchplanUrl(
        fx.fixture.teamId,
        `${startYear}-07-01`,
        `${startYear + 1}-06-30`,
      );

      const actual = await withMockedFetch(
        [{ matchUrl: new RegExp(`^${escapeRegex(url)}$`), htmlPath: fx.rawPath }],
        () =>
          getVorsaisonSpiele(fx.fixture.teamId, fx.saison, {
            loadFont: fixtureFontLoader,
            delayMs: 0,
          }),
      );

      expect(actual).toEqual(fx.fixture.spiele);

      // Strukturelle Garantien unabhängig vom Capture-JSON:
      expect(actual.length).toBeGreaterThan(0);
      const ids = actual.map((s) => s.spielId);
      expect(new Set(ids).size).toBe(ids.length);
      const windowStart = Date.UTC(startYear, 6, 1);
      const windowEnd = Date.UTC(startYear + 1, 6, 1);
      for (const s of actual) {
        expect(s.spielId).toMatch(/^[A-Z0-9]{6,}$/i);
        expect(s.datum).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
        const [dd, mm, yyyy] = s.datum.split(".");
        const t = Date.parse(`${yyyy}-${mm}-${dd}T12:00:00Z`);
        expect(t).toBeGreaterThanOrEqual(windowStart);
        expect(t).toBeLessThan(windowEnd);
        expect(s.heimName.length).toBeGreaterThanOrEqual(2);
        expect(s.gastName.length).toBeGreaterThanOrEqual(2);
        expect(Number.isInteger(s.ergebnisHeim)).toBe(true);
        expect(Number.isInteger(s.ergebnisGast)).toBe(true);
        expect(s.ergebnisHeim).toBeGreaterThanOrEqual(0);
        expect(s.ergebnisGast).toBeGreaterThanOrEqual(0);
      }
      // Chronologisch aufsteigend sortiert.
      const ts = actual.map((s) => {
        const [dd, mm, yyyy] = s.datum.split(".");
        return Date.parse(`${yyyy}-${mm}-${dd}T12:00:00Z`);
      });
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    });
  }
});

describe("getVorsaisonSpiele (Edge-Cases)", () => {
  const TEAM_ID = "TESTTEAMID00000000000000000000AB";

  function matchplanResponse(html: string): string {
    return JSON.stringify({ success: true, html });
  }

  /** Route, die für JEDE Matchplan-URL eine synthetische Antwort liefert. */
  async function runWithBody(body: string): Promise<VorsaisonSpiel[]> {
    const tmp = path.join(HTML_ROOT, "negative", "_vorsaison-tmp.json");
    fs.writeFileSync(tmp, body, "utf-8");
    try {
      return await withMockedFetch(
        [
          {
            matchUrl: /ajax\.team\.matchplan/,
            htmlPath: "negative/_vorsaison-tmp.json",
          },
        ],
        () =>
          getVorsaisonSpiele(TEAM_ID, "2425", {
            loadFont: async () => null,
            delayMs: 0,
          }),
      );
    } finally {
      fs.unlinkSync(tmp);
    }
  }

  it("überspringt Zeilen ohne echten Endstand (Absetzung/info-text)", async () => {
    const html =
      '<table><tr class="row-headline"><td>Sonntag, 18.08.2024 - 15:00 Uhr | Kreisklasse</td></tr>' +
      '<tr><td class="column-club"><div class="club-name">FC A</div></td>' +
      '<td class="column-colon">:</td>' +
      '<td class="column-club no-border"><div class="club-name">FC B</div></td>' +
      '<td class="column-score"><a href="https://www.fussball.de/spiel/a-b/-/spiel/ABCDEF123456"><span class="info-text">Absetzung</span></a></td></tr></table>';
    await expect(runWithBody(matchplanResponse(html))).resolves.toEqual([]);
  });

  it("liest Klartext-Ergebnisse ohne Font (falls fussball.de unverschleiert liefert)", async () => {
    const html =
      '<table><tr class="row-competition"><td>So, 18.08.24 | 15:00 | Kreisklasse | 123456</td></tr>' +
      '<tr><td class="column-club"><div class="club-name">FC Alpha</div></td>' +
      '<td class="column-colon">:</td>' +
      '<td class="column-club no-border"><div class="club-name">SV Beta</div></td>' +
      '<td class="column-score"><a href="https://www.fussball.de/spiel/a-b/-/spiel/ABCDEF123456">' +
      '<span class="score-left">3</span><span class="colon">:</span><span class="score-right">1</span>' +
      "</a></td></tr></table>";
    await expect(runWithBody(matchplanResponse(html))).resolves.toEqual([
      {
        spielId: "ABCDEF123456",
        datum: "18.08.2024",
        heimName: "FC Alpha",
        gastName: "SV Beta",
        ergebnisHeim: 3,
        ergebnisGast: 1,
      },
    ]);
  });

  it("verwirft Spiele außerhalb des Saison-Fensters", async () => {
    const html =
      '<table><tr class="row-headline"><td>Sonntag, 18.08.2023 - 15:00 Uhr</td></tr>' +
      '<tr><td class="column-club"><div class="club-name">FC Alpha</div></td>' +
      '<td class="column-colon">:</td>' +
      '<td class="column-club no-border"><div class="club-name">SV Beta</div></td>' +
      '<td class="column-score"><a href="https://www.fussball.de/spiel/a-b/-/spiel/ABCDEF123456">' +
      '<span class="score-left">3</span><span class="colon">:</span><span class="score-right">1</span>' +
      "</a></td></tr></table>";
    await expect(runWithBody(matchplanResponse(html))).resolves.toEqual([]);
  });

  it("wirft LAUT bei Captcha-/Sicherheitsabfrage-Antwort", async () => {
    await expect(
      runWithBody(
        "<html><head><title>Sicherheitsabfrage</title></head><body>recaptcha/api</body></html>",
      ),
    ).rejects.toThrow(/captcha|sicherheitsabfrage/i);
  });

  it("wirft bei Nicht-JSON-Antwort ohne Captcha-Marker (kein stilles Leer-Ergebnis)", async () => {
    await expect(runWithBody("<html><body>irgendwas</body></html>")).rejects.toThrow(
      /kein JSON/i,
    );
  });

  it("wirft bei ungültigem Saison-Code", async () => {
    await expect(getVorsaisonSpiele(TEAM_ID, "26/27")).rejects.toThrow(
      /Saison-Code/i,
    );
  });
});
