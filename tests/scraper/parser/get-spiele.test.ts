import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadFixtureJson } from "../../setup/playwright-mocks";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  getSpiele,
  type MannschaftHit,
  type SpielListItem,
} from "../../../lib/crawler/fussballde";
import {
  FIXTURE_CLUBS,
  HTML_ROOT,
  JSON_ROOT,
} from "../../fixtures/scraper/config";

// getSpiele holt HTML über undici-fetch (NICHT Browser, NICHT globales fetch)
// — der frühere withMockedBrowser-Mock war dafür ein No-Op und der Test traf
// still das echte fussball.de. Siehe tests/setup/fetch-mocks.ts.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

describe("getSpiele parser", () => {
  for (const club of FIXTURE_CLUBS) {
    const mannschaftenRel = `${club.key}/mannschaften.json`;
    const mannschaftenPath = path.join(JSON_ROOT, mannschaftenRel);
    const mannschaften = existsSync(mannschaftenPath)
      ? (JSON.parse(readFileSync(mannschaftenPath, "utf-8")) as MannschaftHit[])
      : null;

    for (const teamCfg of club.teams) {
      for (const saison of teamCfg.saisons) {
        const title = `parses spielplan for ${club.key}/${teamCfg.key}/saison${saison}`;
        const spieleJsonRel = `${club.key}/${teamCfg.key}-spiele-saison${saison}.json`;
        const spieleHtmlRel = `${club.key}/${teamCfg.key}-spiele-saison${saison}.html`;

        // Fixture-Lücken SICHTBAR skippen (it.skip statt stillem return im
        // Test-Body): das Capture-Script (scripts/fixtures/capture-fixtures.ts)
        // schreibt für Spiele nur JSON, nie HTML — die HTML-Fixtures existieren
        // daher aktuell für KEIN Team. Ohne sichtbaren Skip sah die Suite
        // fälschlich grün aus.
        const missing = [
          ...(mannschaften ? [] : [`json/${mannschaftenRel}`]),
          ...(existsSync(path.join(JSON_ROOT, spieleJsonRel))
            ? []
            : [`json/${spieleJsonRel}`]),
          ...(existsSync(path.join(HTML_ROOT, spieleHtmlRel))
            ? []
            : [`html/${spieleHtmlRel}`]),
        ];
        if (missing.length > 0) {
          it.skip(`${title} — Fixtures fehlen: ${missing.join(", ")}`, () => {
            /* skipped — siehe Titel */
          });
          continue;
        }

        const firstToken = teamCfg.searchName.toLowerCase().split(" ")[0];
        const team = mannschaften?.find((m) =>
          m.name.toLowerCase().includes(firstToken),
        );
        if (!team) {
          it.skip(
            `${title} — Team "${teamCfg.searchName}" nicht in json/${mannschaftenRel}`,
            () => {
              /* skipped — siehe Titel */
            },
          );
          continue;
        }

        it(
          title,
          async () => {
            const expected =
              await loadFixtureJson<SpielListItem[]>(spieleJsonRel);

            const actual = await withMockedFetch(
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
          },
          120_000,
        );
      }
    }
  }
});
