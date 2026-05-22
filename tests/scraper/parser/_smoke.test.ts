import { describe, it, expect } from "vitest";
import { withMockedBrowser } from "../../setup/playwright-mocks";

describe("playwright-mocks smoke", () => {
  it("serves a fixture HTML when URL matches", async () => {
    const title = await withMockedBrowser(
      [{ matchUrl: /fussball\.de\/suche/, htmlPath: "dossenheim/search.html" }],
      async (page) => {
        await page.goto("https://www.fussball.de/suche/-/text/Dossenheim");
        return page.title();
      },
    );
    expect(typeof title).toBe("string");
  }, 30_000);
});
