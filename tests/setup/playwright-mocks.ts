// tests/setup/playwright-mocks.ts
//
// Mock-Helper for parser tests.
//
// The crawler functions in lib/crawler/fussballde.ts launch their own
// chromium browser via `chromium.launch()`. To run them against captured
// HTML fixtures without internet access, we monkey-patch `chromium.launch`
// for the duration of the test so every newly launched browser context
// automatically installs route handlers that serve fixtures from disk.
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type Route,
} from "playwright";
import fs from "fs/promises";
import path from "path";
import { HTML_ROOT, JSON_ROOT } from "../fixtures/scraper/config";

export type FixtureRoute = {
  /** Regex tested against `route.request().url()` — first match wins */
  matchUrl: RegExp;
  /** Path of HTML fixture relative to HTML_ROOT (e.g. `dossenheim/search.html`) */
  htmlPath: string;
};

async function installRoutes(
  context: BrowserContext,
  routes: FixtureRoute[],
): Promise<void> {
  await context.route("**/*", async (route: Route) => {
    const url = route.request().url();
    const hit = routes.find((r) => r.matchUrl.test(url));
    if (!hit) {
      // Abort asset requests so they don't slow the test down.
      if (/\.(css|js|png|jpg|jpeg|gif|woff2?|svg|ico)(\?|$)/i.test(url)) {
        return route.abort();
      }
      // Any other unmatched URL → 404 so parsers see "empty page" rather than
      // hanging waiting for a network response.
      return route.fulfill({
        status: 404,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body>fixture not found</body></html>",
      });
    }
    const html = await fs.readFile(path.join(HTML_ROOT, hit.htmlPath), "utf-8");
    return route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    });
  });
}

/**
 * Runs `fn` with `chromium.launch` patched so that every browser context
 * created inside the callback (including those launched by the production
 * crawler) intercepts navigations and serves the supplied fixtures.
 *
 * The callback receives the *first* page of the *first* launched browser
 * so callers that want to drive Playwright directly (e.g. the smoke test)
 * still can. Most parser tests ignore the `page` argument and instead invoke
 * the production crawler, which launches its own browser internally.
 */
export async function withMockedBrowser<T>(
  routes: FixtureRoute[],
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const originalLaunch = chromium.launch.bind(chromium);
  const launchedBrowsers: Browser[] = [];
  const launchedContexts: BrowserContext[] = [];
  let firstPage: Page | undefined;

  // Replace chromium.launch with a wrapper that auto-installs the routes on
  // every newContext call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chromium as any).launch = async (...args: unknown[]) => {
    const browser = await originalLaunch(
      ...(args as Parameters<typeof originalLaunch>),
    );
    launchedBrowsers.push(browser);

    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = (async (options?: BrowserContextOptions) => {
      const ctx = await originalNewContext(options);
      launchedContexts.push(ctx);
      await installRoutes(ctx, routes);
      return ctx;
    }) as typeof browser.newContext;

    return browser;
  };

  // Launch the *driver* browser explicitly so that the callback receives a
  // usable Page even when it doesn't invoke the production crawler.
  const driverBrowser = await chromium.launch({ headless: true });
  const driverContext = await driverBrowser.newContext();
  firstPage = await driverContext.newPage();

  try {
    return await fn(firstPage);
  } finally {
    // Restore the original launch fn so other tests aren't affected.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chromium as any).launch = originalLaunch;
    // Best-effort cleanup of everything we launched.
    for (const ctx of launchedContexts) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
    for (const browser of launchedBrowsers) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function loadFixtureJson<T>(relPath: string): Promise<T> {
  return JSON.parse(
    await fs.readFile(path.join(JSON_ROOT, relPath), "utf-8"),
  ) as T;
}

export async function fixtureExists(relPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(JSON_ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

export async function htmlFixtureExists(relPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(HTML_ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}
