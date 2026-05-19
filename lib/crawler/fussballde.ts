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
  return withPage(async (page) => {
    const url = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const ajaxUrl = `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`;
    try {
      await page.goto(ajaxUrl, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1500);
    } catch {
      // fallback: bleiben auf Main-Page
    }

    const raw = await page.evaluate(() => {
      const results: Array<{
        spielId: string;
        slug: string;
        datum: string;
        heim: string;
        gast: string;
        ergebnis: string;
        vergangen: boolean;
        url: string;
      }> = [];
      const seen = new Set<string>();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parseDatum = (d: string): Date | null => {
        const parts = d.split(".");
        if (parts.length !== 3) return null;
        const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
        return new Date(`${year}-${parts[1]}-${parts[0]}`);
      };

      const allTrs = [...document.querySelectorAll("tr")];
      let currentDatum = "";
      allTrs.forEach((tr) => {
        if (tr.classList.contains("row-headline") || tr.classList.contains("row-competition")) {
          const txt = tr.textContent?.replace(/\s+/g, " ").trim() || "";
          const dm = txt.match(/(\d{2}\.\d{2}\.\d{4})/);
          const dm2 = txt.match(/(\d{2}\.\d{2}\.\d{2})(?!\d)/);
          if (dm) currentDatum = dm[1];
          else if (dm2) currentDatum = dm2[1];
          return;
        }

        const link = tr.querySelector<HTMLAnchorElement>('a[href*="/spiel/"]');
        if (!link) return;
        const href = link.href || "";
        const m = href.match(/\/spiel\/([^/]+)\/-\/spiel\/([A-Z0-9]+)/);
        if (!m || seen.has(m[2])) return;
        if (!currentDatum) return;

        const matchDate = parseDatum(currentDatum);
        if (!matchDate || matchDate >= today) return;
        seen.add(m[2]);

        const tds = [...tr.querySelectorAll("td")].map((td) =>
          (td.textContent || "").replace(/\s+/g, " ").trim()
        );
        const teamTds = tds.filter((t) => t && t !== ":" && t !== "Zum Spiel");

        results.push({
          spielId: m[2],
          slug: m[1],
          datum: currentDatum,
          heim: teamTds[0] || "",
          gast: teamTds[1] || "",
          ergebnis: "",
          vergangen: true,
          url: href
        });
      });

      return results;
    });

    raw.sort((a, b) => {
      const parse = (d: string): number => {
        const p = d.split(".");
        if (p.length !== 3) return 0;
        const y = p[2].length === 2 ? "20" + p[2] : p[2];
        return new Date(`${y}-${p[1]}-${p[0]}`).getTime();
      };
      return parse(b.datum) - parse(a.datum);
    });

    return raw;
  });
}

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  throw new Error("not implemented");
}
