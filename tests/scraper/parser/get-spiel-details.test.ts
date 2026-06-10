import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadFixtureJson } from "../../setup/playwright-mocks";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  getSpielDetails,
  type MannschaftHit,
} from "../../../lib/crawler/fussballde";
import {
  FIXTURE_CLUBS,
  HTML_ROOT,
  JSON_ROOT,
} from "../../fixtures/scraper/config";

// getSpielDetails holt HTML über undici-fetch (NICHT Browser, NICHT globales
// fetch) — der frühere withMockedBrowser-Mock war dafür ein No-Op und der
// Test traf still das echte fussball.de. Siehe tests/setup/fetch-mocks.ts.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

type ExpectedSpielDetails = {
  matchId?: string;
  spielId?: string;
  halbzeit: { heim: number | null; gast: number | null } | null;
  events: Array<{
    minute: number;
    type?: string;
    typ?: string;
    side: "heim" | "gast";
  }>;
};

function listDetailFixtures(clubKey: string, teamKey: string): string[] {
  try {
    return readdirSync(path.join(JSON_ROOT, clubKey)).filter(
      (f) => f.startsWith(`${teamKey}-spiel-`) && f.endsWith(".json"),
    );
  } catch {
    return [];
  }
}

describe("getSpielDetails parser", () => {
  for (const club of FIXTURE_CLUBS) {
    const mannschaftenRel = `${club.key}/mannschaften.json`;
    const mannschaftenPath = path.join(JSON_ROOT, mannschaftenRel);
    const mannschaften = existsSync(mannschaftenPath)
      ? (JSON.parse(readFileSync(mannschaftenPath, "utf-8")) as MannschaftHit[])
      : null;

    for (const teamCfg of club.teams) {
      const title = `parses spieldetails for ${club.key}/${teamCfg.key}`;
      const jsonFixtures = listDetailFixtures(club.key, teamCfg.key);

      // Fixture-Lücken SICHTBAR skippen (it.skip statt stillem return im
      // Test-Body): das Capture-Script (scripts/fixtures/capture-fixtures.ts)
      // schreibt pro Spiel nur JSON, nie HTML — Spiel-HTML-Fixtures existieren
      // daher aktuell für KEIN Team. Ohne sichtbaren Skip sah die Suite
      // fälschlich grün aus.
      if (jsonFixtures.length === 0) {
        it.skip(`${title} — keine Spiel-Detail-Fixtures (JSON) captured`, () => {
          /* skipped — siehe Titel */
        });
        continue;
      }
      if (!mannschaften) {
        it.skip(`${title} — Fixture fehlt: json/${mannschaftenRel}`, () => {
          /* skipped — siehe Titel */
        });
        continue;
      }

      const firstToken = teamCfg.searchName.toLowerCase().split(" ")[0];
      const team = mannschaften.find((m) =>
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

      const withHtml = jsonFixtures.filter((f) =>
        existsSync(
          path.join(HTML_ROOT, club.key, f.replace(/\.json$/, ".html")),
        ),
      );
      if (withHtml.length === 0) {
        it.skip(
          `${title} — HTML-Fixtures fehlen (0/${jsonFixtures.length} Spiele)`,
          () => {
            /* skipped — siehe Titel */
          },
        );
        continue;
      }

      it(
        `${title} (${withHtml.length}/${jsonFixtures.length} Spiele mit HTML-Fixture)`,
        async () => {
          for (const file of withHtml) {
            const spielId = file
              .replace(`${teamCfg.key}-spiel-`, "")
              .replace(".json", "");
            const htmlRel = `${club.key}/${teamCfg.key}-spiel-${spielId}.html`;

            const expected = await loadFixtureJson<ExpectedSpielDetails>(
              `${club.key}/${file}`,
            );

            // Nur die Spiel-Detail-Seite wird gemockt. Spielerprofil-Fetches
            // (resolvePlayerName) und der Score-Font-Fetch (score-font.ts)
            // bekommen vom Mock eine 404 — beide haben dafür Fallbacks
            // (Spieler-ID als Name, Tor-Events statt dekodiertem Endstand),
            // die Assertions hier hängen nicht davon ab.
            const actual = await withMockedFetch(
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
        },
        180_000,
      );
    }
  }
});
