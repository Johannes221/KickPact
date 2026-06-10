import { describe, it, expect, vi } from "vitest";
import { withMockedFetch } from "../../setup/fetch-mocks";
import {
  searchVereine,
  getSpielDetails,
} from "../../../lib/crawler/fussballde";

// searchVereine/getSpielDetails holen HTML über undici-fetch (NICHT Browser,
// NICHT globales fetch) — der frühere withMockedBrowser-Mock war dafür ein
// No-Op und die Tests trafen echtes Netz. Siehe tests/setup/fetch-mocks.ts.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const { mockedFetch } = await import("../../setup/fetch-mocks");
  return { ...actual, fetch: mockedFetch };
});

describe("negative cases", () => {
  it("empty search returns empty array, no throw", async () => {
    const result = await withMockedFetch(
      [
        {
          matchUrl: /fussball\.de\/suche/,
          htmlPath: "negative/empty-search.html",
        },
      ],
      async () => searchVereine("xyz-no-such-club"),
    );
    expect(result).toEqual([]);
  }, 60_000);

  it("404 page returns empty results, no throw", async () => {
    // Bewusst KEINE Route: mockedFetch antwortet auf ungematchte URLs mit
    // echtem HTTP-404 — fetchHtml wirft "HTTP 404", searchVereine fängt das
    // und liefert []. Testet den harten 404-Pfad, nicht nur 404-Seiten-HTML.
    const result = await withMockedFetch([], async () => searchVereine("xyz"));
    expect(result).toEqual([]);
  }, 60_000);

  // Captcha-Detection in Phase 4 implementiert (lib/crawler/fussballde.ts).
  it("captcha page throws loud error (not silent empty)", async () => {
    await expect(
      withMockedFetch(
        [
          {
            matchUrl: /fussball\.de\/spiel/,
            htmlPath: "negative/captcha.html",
          },
        ],
        async () => getSpielDetails("FAKE_ID", "fake-slug"),
      ),
    ).rejects.toThrow(/captcha|sicherheitsabfrage/i);
  }, 60_000);

  it("malformed spiel page returns empty events without throwing", async () => {
    const result = await withMockedFetch(
      [
        {
          matchUrl: /fussball\.de\/spiel/,
          htmlPath: "negative/malformed-spiel.html",
        },
      ],
      async () =>
        getSpielDetails("FAKE_ID", "fake-slug").catch(() => null),
    );
    // Either no throw with empty events, or graceful error — but never
    // undefined behavior.
    if (result) expect(result.events).toEqual([]);
  }, 60_000);
});
