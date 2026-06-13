import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  withMockedBrowser,
  loadFixtureJson,
} from "../../setup/playwright-mocks";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  getKader,
  type MannschaftHit,
  type KaderPlayer,
} from "../../../lib/crawler/fussballde";
import {
  FIXTURE_CLUBS,
  HTML_ROOT,
  JSON_ROOT,
} from "../../fixtures/scraper/config";

// getKader lädt die Mannschaftsseite über Playwright (withPage) — das deckt
// withMockedBrowser ab. Die Namensauflösung obfuskierter Spieler
// (resolvePlayerName → fetchHtml) läuft aber über undici-fetch und ginge am
// Browser-Mock vorbei ins echte fussball.de. Siehe tests/setup/fetch-mocks.ts.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

describe("getKader parser", () => {
  for (const club of FIXTURE_CLUBS) {
    const mannschaftenRel = `${club.key}/mannschaften.json`;
    const mannschaftenPath = path.join(JSON_ROOT, mannschaftenRel);
    const mannschaften = existsSync(mannschaftenPath)
      ? (JSON.parse(readFileSync(mannschaftenPath, "utf-8")) as MannschaftHit[])
      : null;

    for (const teamCfg of club.teams) {
      for (const saison of teamCfg.saisons) {
        const title = `parses kader for ${club.key}/${teamCfg.key}/saison${saison}`;
        const kaderJsonRel = `${club.key}/${teamCfg.key}-kader-saison${saison}.json`;
        const kaderHtmlRel = `${club.key}/${teamCfg.key}-kader-saison${saison}.html`;

        // Fixture-Lücken SICHTBAR skippen (it.skip statt stillem return im
        // Test-Body): das Capture-Script (scripts/fixtures/capture-fixtures.ts,
        // captureKader) schreibt nur Kader-JSON, nie HTML — Kader-HTML-Fixtures
        // existieren daher aktuell für KEIN Team. HTML-Capture wurde bewusst
        // NICHT nachgerüstet: getKader holt die Seite über Playwright/withPage
        // (kein fetchHtml-Pfad, den das Script abgreifen könnte), und die im
        // JSON captured Spielernamen hängen zusätzlich an N Spielerprofil-
        // Seiten, die ebenfalls niemand captured. Ohne sichtbaren Skip sah die
        // Suite fälschlich grün aus.
        const missing = [
          ...(mannschaften ? [] : [`json/${mannschaftenRel}`]),
          ...(existsSync(path.join(JSON_ROOT, kaderJsonRel))
            ? []
            : [`json/${kaderJsonRel}`]),
          ...(existsSync(path.join(HTML_ROOT, kaderHtmlRel))
            ? []
            : [`html/${kaderHtmlRel}`]),
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
            const expected = await loadFixtureJson<KaderPlayer[]>(kaderJsonRel);

            // Doppel-Mock: die Mannschaftsseite kommt aus dem Browser-Mock,
            // die Spielerprofil-Fetches (resolvePlayerName, undici) laufen in
            // withMockedFetch ohne Routen → 404 → fetchHtml wirft →
            // resolvePlayerName fällt auf die Spieler-ID als Name zurück.
            // Die Assertions hängen nicht an aufgelösten Klarnamen.
            const actual = await withMockedFetch([], () =>
              withMockedBrowser(
                [
                  {
                    matchUrl: new RegExp(
                      `fussball\\.de/mannschaft/${team.slug}`,
                    ),
                    htmlPath: kaderHtmlRel,
                  },
                ],
                async () => getKader(team.teamId, team.slug, saison),
              ),
            );

            expect(actual.length).toBe(expected.length);
            for (const p of actual) {
              expect(p.name).toBeTruthy();
              expect(p.name.length).toBeGreaterThan(1);
            }
          },
          120_000,
        );
      }
    }
  }

  // Regression (2026-06-11): getKader holt den Kader jetzt über das server-
  // gerenderte AJAX-Fragment ajax.team.squad (undici-fetch, kein Browser).
  // fussball.de gibt Kader nur frei, wenn der Team-Admin ihn veröffentlicht hat.
  it("privater (nicht freigegebener) Kader → leere Liste, kein Garbage", async () => {
    const result = await withMockedFetch(
      [{ matchUrl: /ajax\.team\.squad/, htmlPath: "negative/squad-private.html" }],
      async () => getKader("ANYTEAMID00000000000", "slug", "2526"),
    );
    expect(result).toEqual([]);
  }, 60_000);

  it("veröffentlichter Kader → Spieler aus Zeilen, Namen über Profilseite aufgelöst", async () => {
    const result = await withMockedFetch(
      [
        { matchUrl: /ajax\.team\.squad/, htmlPath: "squad/published-2players.html" },
        { matchUrl: /userid\/TEST0AAAAA/, htmlPath: "squad/profile-p1.html" },
        { matchUrl: /userid\/TEST0BBBBB/, htmlPath: "squad/profile-p2.html" },
      ],
      async () => getKader("ANYTEAMID00000000000", "slug", "2526"),
    );
    expect(result.map((p) => p.name)).toEqual(["Lukas Beispiel", "Mara Probe"]);
    expect(result.every((p) => p.spielerId)).toBe(true);
  }, 60_000);
});
