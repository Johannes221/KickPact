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
  throw new Error("not implemented");
}

export async function getMannschaften(
  vereinId: string,
  slug: string
): Promise<MannschaftHit[]> {
  throw new Error("not implemented");
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
