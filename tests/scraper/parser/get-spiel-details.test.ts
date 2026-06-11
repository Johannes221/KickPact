/**
 * Fixture-Replay-Tests für getSpielDetails gegen echte Spiel-Detailseiten.
 *
 * Pro Spiel reicht EIN HTML-Fixture (der fetchHtml-Aufruf auf die Detailseite).
 * Spielerprofil-Fetches und der Obfuscation-Font-Fetch laufen im Test gegen
 * den 404-Fallback des Fetch-Mocks — beide haben Fallbacks (Spielername = ID,
 * Endstand = Tor-Event-Zählung), deshalb asserten wir hier nur Event-Struktur
 * (Anzahl, Minuten-Ordnung, Seite), nicht Namen oder Ergebnis.
 *
 * Tests skippen sichtbar (it.skipIf), solange für ein Team keine
 * JSON+HTML-Fixture-Paare existieren: `npm run fixtures:capture` nachholen.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  getSpielDetails,
  type MannschaftHit,
  type ScrapedEvent,
  type SpielDetails,
} from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS, HTML_ROOT, JSON_ROOT } from "../../fixtures/scraper/config";

type ExpectedSpielDetails = Pick<SpielDetails, "halbzeit" | "events">;

/**
 * Vergleichbare Projektion eines Events. Ausgenommen sind NUR die Namen
 * (spielerName, rein.name, raus.name): die kommen aus Spielerprofil-Fetches,
 * die im Capture-Lauf aufgelöst wurden, im Test aber 404 → ID-Fallback laufen.
 * Alles andere (typ, minute, side, IDs) stammt aus der Detailseite selbst und
 * muss das Capture-JSON exakt reproduzieren.
 */
function comparableEvent(e: ScrapedEvent) {
  return {
    typ: e.typ,
    minute: e.minute,
    side: e.side,
    spielerId: e.spielerId ?? null,
    rein: e.rein?.id ?? null,
    raus: e.raus?.id ?? null,
  };
}

// getSpielDetails holt HTML über undici-fetch (NICHT Browser, NICHT globales
// fetch) — der frühere withMockedBrowser-Mock war dafür ein No-Op und die
// Tests hätten echtes Netz getroffen. Siehe tests/setup/fetch-mocks.ts.
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

/**
 * Spiel-Fixtures eines Teams, für die JSON UND HTML existieren. JSON ohne
 * HTML-Gegenstück (älterer Capture-Stand) wird übersprungen — Capture-Script
 * erneut laufen lassen, das holt fehlende HTML-Seiten nach.
 */
function listDetailPairs(
  clubKey: string,
  teamKey: string,
): Array<{ spielId: string; jsonRel: string; htmlRel: string }> {
  let files: string[];
  try {
    files = fs.readdirSync(path.join(JSON_ROOT, clubKey));
  } catch {
    return [];
  }
  return files
    .filter((f) => f.startsWith(`${teamKey}-spiel-`) && f.endsWith(".json"))
    .map((f) => {
      const spielId = f
        .replace(`${teamKey}-spiel-`, "")
        .replace(".json", "");
      return {
        spielId,
        jsonRel: `${clubKey}/${f}`,
        htmlRel: `${clubKey}/${teamKey}-spiel-${spielId}.html`,
      };
    })
    .filter((p) => fs.existsSync(path.join(HTML_ROOT, p.htmlRel)));
}

describe("getSpielDetails parser", () => {
  for (const club of FIXTURE_CLUBS) {
    const mannschaften = readMannschaften(club.key);
    for (const teamCfg of club.teams) {
      const firstToken = teamCfg.searchName.toLowerCase().split(" ")[0];
      const team = mannschaften?.find((m) =>
        m.name.toLowerCase().includes(firstToken),
      );
      const pairs = listDetailPairs(club.key, teamCfg.key);

      it.skipIf(!team || pairs.length === 0)(
        `parses spieldetails for ${club.key}/${teamCfg.key}`,
        async () => {
          for (const pair of pairs) {
            const expected = JSON.parse(
              await fs.promises.readFile(
                path.join(JSON_ROOT, pair.jsonRel),
                "utf-8",
              ),
            ) as ExpectedSpielDetails;

            const actual = await withMockedFetch(
              [
                {
                  matchUrl: new RegExp(
                    `fussball\\.de/spiel/.*spiel/${pair.spielId}$`,
                  ),
                  htmlPath: pair.htmlRel,
                },
              ],
              () => getSpielDetails(pair.spielId, team!.slug),
            );

            // Events feldweise (ohne Namen, s. comparableEvent) und Halbzeit
            // exakt gegen das Capture-JSON; beide Seiten parsen dasselbe HTML,
            // jede Abweichung ist ein Parser-Regress.
            expect(actual.events.map(comparableEvent)).toEqual(
              expected.events.map(comparableEvent),
            );
            expect(actual.halbzeit).toEqual(expected.halbzeit);
            // Plausibilitäts-Check auf den Live-Daten: Minuten im Fußball-Rahmen.
            for (const e of actual.events) {
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
