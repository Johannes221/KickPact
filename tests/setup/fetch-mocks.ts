// tests/setup/fetch-mocks.ts
//
// Fetch-Mock-Helper für Parser-Tests gegen den fetch-basierten Crawler.
//
// Die Crawler-Funktionen in lib/crawler/fussballde.ts holen HTML seit dem
// Umstieg auf plain HTTP über `import { fetch } from "undici"` (bewusst NICHT
// das globale fetch — siehe fetchHtml-Docblock dort). `withMockedBrowser`
// (playwright-mocks.ts) greift für diese Funktionen nicht mehr: es patcht nur
// `chromium.launch`, der undici-Fetch läuft daran vorbei ins echte Netz.
//
// Dieses Modul ist das fetch-Pendant: Test-Dateien mocken das undici-Modul via
//
//   vi.mock("undici", async (importOriginal) => {
//     const actual = await importOriginal<typeof import("undici")>();
//     const { mockedFetch } = await import("../../setup/fetch-mocks");
//     return { ...actual, fetch: mockedFetch };
//   });
//
// und scopen die Fixture-Routen pro Test über `withMockedFetch`. Außerhalb
// eines withMockedFetch-Blocks wirft jeder fetch laut — kein Test trifft
// still das echte fussball.de (Captcha-Risiko, flaky Ergebnisse).
//
// WICHTIG: dieses Modul darf undici NICHT importieren, sonst entsteht ein
// Import-Zyklus mit der vi.mock-Factory (undici-Mock → fetch-mocks → undici).
import fs from "fs/promises";
import path from "path";
import { HTML_ROOT } from "../fixtures/scraper/config";

export type FetchFixtureRoute = {
  /** Regex gegen die angefragte URL — erster Treffer gewinnt */
  matchUrl: RegExp;
  /** Pfad der HTML-Fixture relativ zu HTML_ROOT (z.B. `negative/captcha.html`) */
  htmlPath: string;
};

let activeRoutes: FetchFixtureRoute[] | null = null;

/**
 * Drop-in-Ersatz für undicis `fetch` in Tests. Liefert für die erste passende
 * Route die Fixture-Datei als 200er-HTML-Response; unbekannte URLs bekommen —
 * analog zum Browser-Mock — eine 404-Platzhalterseite, damit Parser "leere
 * Seite" sehen statt zu hängen (withRetry behandelt 404 als nicht-transient,
 * es gibt also keine Retry-Verzögerung). Die Crawler-Callsites nutzen nur
 * `status`/`ok`/`text()`/`arrayBuffer()` — die globale Node-Response reicht
 * als Ersatz für die undici-Response.
 */
export async function mockedFetch(
  input: string | URL | { url: string },
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!activeRoutes) {
    throw new Error(
      `Unerwarteter fetch außerhalb von withMockedFetch: ${url}`,
    );
  }
  const hit = activeRoutes.find((r) => r.matchUrl.test(url));
  if (!hit) {
    return new Response(
      "<!doctype html><html><body>fixture not found</body></html>",
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const html = await fs.readFile(path.join(HTML_ROOT, hit.htmlPath), "utf-8");
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Führt `fn` mit aktiven Fixture-Routen aus. Voraussetzung: die Test-Datei
 * hat das undici-Modul auf `mockedFetch` gemockt (siehe Modul-Docblock).
 * Fehlt das `vi.mock`-Boilerplate, wirft der Guard hier sofort — sonst wäre
 * der Wrapper ein stiller No-Op und der Test träfe echtes Netz (exakt der
 * Fehlermodus, den withMockedBrowser für die fetch-basierten Crawler hatte).
 *
 * Nicht nesting-/concurrent-fest: `activeRoutes` ist modul-global und wird im
 * finally hart zurückgesetzt — kein `it.concurrent` über diesem Helper.
 */
export async function withMockedFetch<T>(
  routes: FetchFixtureRoute[],
  fn: () => Promise<T>,
): Promise<T> {
  // Laufzeit-Guard: löst das undici-Modul auf, das auch der Crawler sieht.
  // Mit korrektem vi.mock ist das die gemockte Instanz (Registry ist zu diesem
  // Zeitpunkt längst aktiv — kein Import-Zyklus wie beim Top-Level-Import).
  const undici = await import("undici");
  if (undici.fetch !== mockedFetch) {
    throw new Error(
      "withMockedFetch: undici ist nicht gemockt — der Testdatei fehlt das " +
        'vi.mock("undici", ...)-Boilerplate aus dem Docblock von tests/setup/fetch-mocks.ts.',
    );
  }
  activeRoutes = routes;
  try {
    return await fn();
  } finally {
    activeRoutes = null;
  }
}
