import { chromium, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface VereinHit {
  name: string;
  slug: string;
  vereinId: string;
  url: string;
}

export interface MannschaftHit {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
}

export interface SpielListItem {
  spielId: string;
  slug: string;
  datum: string; // DD.MM.YYYY
  heim: string;
  gast: string;
  ergebnis: string;
  vergangen: boolean;
  url: string;
}

export interface SpielDetails {
  spielId: string;
  heim: string;
  gast: string;
  ergebnis: { heim: number; gast: number };
  halbzeit: { heim: number; gast: number } | null;
  events: ScrapedEvent[];
}

export interface ScrapedEvent {
  typ: "TOR" | "AUSWECHSLUNG";
  minute: number | null;
  side: "heim" | "gast" | "unbekannt";
  spielerId?: string;
  spielerName?: string;
  rein?: { id: string; name: string };
  raus?: { id: string; name: string };
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function searchVereine(suchbegriff: string): Promise<VereinHit[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(suchbegriff)}/restriction/-1#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      const results: Array<{
        name: string;
        slug: string;
        vereinId: string;
        url: string;
      }> = [];
      const seen = new Set<string>();
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/verein/"]').forEach((link) => {
        const href = link.href || link.getAttribute("href") || "";
        const m = href.match(/\/verein\/([^/]+)\/-\/id\/([A-Z0-9]+)/);
        if (m && !seen.has(m[2])) {
          seen.add(m[2]);
          const name = link.textContent?.replace(/\s+/g, " ").trim() || m[1];
          results.push({ name, slug: m[1], vereinId: m[2], url: href });
        }
      });
      return results;
    });
  });
}

export async function getMannschaften(
  vereinId: string,
  slug: string
): Promise<MannschaftHit[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/verein/${slug}/-/id/${vereinId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      const results: Array<{
        name: string;
        slug: string;
        saison: string;
        teamId: string;
        url: string;
      }> = [];
      const seen = new Set<string>();
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/mannschaft/"]').forEach((link) => {
        const href = link.href || link.getAttribute("href") || "";
        const m = href.match(/\/mannschaft\/([^/]+)\/-\/saison\/(\d+)\/team-id\/([A-Z0-9]+)/);
        if (m && !seen.has(m[3])) {
          seen.add(m[3]);
          const name = link.textContent?.replace(/\s+/g, " ").trim() || m[1];
          results.push({
            name,
            slug: m[1],
            saison: m[2],
            teamId: m[3],
            url: href
          });
        }
      });
      return results;
    });
  });
}

export async function getSpiele(
  teamId: string,
  slug: string,
  saison: string
): Promise<SpielListItem[]> {
  throw new Error("not implemented");
}

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  throw new Error("not implemented");
}
