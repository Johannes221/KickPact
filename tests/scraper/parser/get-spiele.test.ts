/**
 * Fixture-Replay-Tests für getSpiele gegen echte fussball.de-HTML-Captures.
 *
 * getSpiele paginiert über vier AJAX-Strategien (prev/next × ohne/mit saison,
 * je mit index-Seiten) — das Capture-Script speichert deshalb EINE HTML-Datei
 * pro AJAX-Request (Option a, siehe tests/fixtures/scraper/spiele-pages.ts)
 * und regeneriert das erwartete JSON aus demselben Live-Lauf. Der Test baut
 * für jede vorhandene Seiten-Datei eine exakt verankerte URL-Route; nicht
 * gecapturte Seiten bekommen vom Mock 404 → paginateTeamGames bricht dort ab,
 * exakt wie der Live-Lauf an seiner Abbruchstelle.
 *
 * Tests skippen sichtbar (it.skipIf), solange für ein Team/Saison-Paar keine
 * Seiten-Fixtures gecaptured sind: `npm run fixtures:capture` nachholen.
 *
 * Wurde der Parser bewusst gefixt und liefert für dasselbe HTML ein anderes
 * Ergebnis, sind die Golden-JSONs veraltet — offline neu ableiten mit:
 *   REGEN_SPIELE_JSON=1 npx vitest run tests/scraper/parser/get-spiele.test.ts
 * (danach den Diff prüfen und normal laufen lassen).
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  getSpiele,
  type MannschaftHit,
  type SpielListItem,
} from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS, HTML_ROOT, JSON_ROOT } from "../../fixtures/scraper/config";
import {
  parseSpielePageFileName,
  spielePageUrlRegex,
} from "../../fixtures/scraper/spiele-pages";

// getSpiele holt HTML über undici-fetch (NICHT Browser, NICHT globales fetch)
// — der frühere withMockedBrowser-Mock war dafür ein No-Op und die Tests
// hätten echtes Netz getroffen. Siehe tests/setup/fetch-mocks.ts.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

function readMannschaften(clubKey: string): MannschaftHit[] | null {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(JSON_ROOT, clubKey, "mannschaften.json"),
        "utf-8",
      ),
    ) as MannschaftHit[];
  } catch {
    return null;
  }
}

/** Alle gecapturten Pagination-Seiten für ein Team/Saison-Paar (Dateiname + Parameter). */
function listSpielePages(clubKey: string, teamKey: string, saison: string) {
  let files: string[];
  try {
    files = fs.readdirSync(path.join(HTML_ROOT, clubKey));
  } catch {
    return [];
  }
  return files
    .map((file) => ({ file, page: parseSpielePageFileName(file) }))
    .filter(
      (
        e,
      ): e is { file: string; page: NonNullable<typeof e.page> } =>
        e.page !== null &&
        e.page.teamKey === teamKey &&
        e.page.saison === saison,
    );
}

describe("getSpiele parser", () => {
  for (const club of FIXTURE_CLUBS) {
    const mannschaften = readMannschaften(club.key);
    for (const teamCfg of club.teams) {
      const firstToken = teamCfg.searchName.toLowerCase().split(" ")[0];
      const team = mannschaften?.find((m) =>
        m.name.toLowerCase().includes(firstToken),
      );
      for (const saison of teamCfg.saisons) {
        const pages = listSpielePages(club.key, teamCfg.key, saison);
        const jsonRel = `${club.key}/${teamCfg.key}-spiele-saison${saison}.json`;
        const hasJson = fs.existsSync(path.join(JSON_ROOT, jsonRel));
        const missingFixtures = !team || pages.length === 0 || !hasJson;

        it.skipIf(missingFixtures)(
          `parses spielplan for ${club.key}/${teamCfg.key}/saison${saison}`,
          async () => {
            const routes = pages.map(({ file, page }) => ({
              matchUrl: spielePageUrlRegex(team!.teamId, saison, page),
              htmlPath: `${club.key}/${file}`,
            }));

            const expected = JSON.parse(
              await fs.promises.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"),
            ) as SpielListItem[];

            const actual = await withMockedFetch(routes, () =>
              getSpiele(team!.teamId, team!.slug, saison),
            );

            // Golden-JSON aus dem GESPEICHERTEN HTML neu ableiten, wenn der
            // Parser bewusst gefixt wurde und dasselbe HTML jetzt ein anderes
            // (richtigeres) Ergebnis liefert — dann sind die JSONs veraltet,
            // nicht die HTMLs. `fixtures:capture --force` wäre dafür falsch: es
            // scrapt live neu und schriebe die HTMLs auf den heutigen Kalender
            // um (im Juli: eine Saison ohne gespielte Spiele).
            //   REGEN_SPIELE_JSON=1 npx vitest run tests/scraper/parser/get-spiele.test.ts
            if (process.env.REGEN_SPIELE_JSON) {
              await fs.promises.writeFile(
                path.join(JSON_ROOT, jsonRel),
                JSON.stringify(actual, null, 2) + "\n",
              );
              return;
            }

            // Feldweiser Vergleich gegen das Capture-JSON. Einzige Ausnahme:
            // `vergangen` ist zeitabhängig (matchDate < today zur LAUFZEIT) —
            // alle anderen Felder, inkl. status/league/heim/gast, müssen das
            // Capture-Ergebnis exakt reproduzieren.
            const comparable = (s: SpielListItem) => ({
              spielId: s.spielId,
              slug: s.slug,
              datum: s.datum,
              heim: s.heim,
              gast: s.gast,
              ergebnis: s.ergebnis,
              status: s.status,
              url: s.url,
              league: s.league,
            });
            expect(actual.map(comparable)).toEqual(expected.map(comparable));
            const ids = actual.map((a) => a.spielId);
            expect(new Set(ids).size).toBe(ids.length);
            for (const a of actual) {
              expect(a.datum).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
            }
          },
          120_000,
        );
      }
    }
  }
});
