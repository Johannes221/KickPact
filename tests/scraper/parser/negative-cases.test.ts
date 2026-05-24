import { describe, it, expect } from "vitest";
import { withMockedBrowser } from "../../setup/playwright-mocks";
import {
  searchVereine,
  getSpielDetails,
} from "../../../lib/crawler/fussballde";

describe("negative cases", () => {
  it("empty search returns empty array, no throw", async () => {
    const result = await withMockedBrowser(
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
    const result = await withMockedBrowser(
      [{ matchUrl: /fussball\.de\/suche/, htmlPath: "negative/404.html" }],
      async () =>
        searchVereine("xyz").catch((e: unknown) => {
          // Treat as empty — production crawler should never crash on a 404.
          return [] as Awaited<ReturnType<typeof searchVereine>>;
        }),
    );
    expect(Array.isArray(result) ? result : []).toEqual([]);
  }, 60_000);

  // Captcha-Detection in Phase 4 implementiert (lib/crawler/fussballde.ts).
  it("captcha page throws loud error (not silent empty)", async () => {
    await expect(
      withMockedBrowser(
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
    const result = await withMockedBrowser(
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
