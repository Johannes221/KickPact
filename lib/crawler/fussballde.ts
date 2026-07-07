import { createHash } from "node:crypto";
import { chromium, type Page } from "playwright";
import { fetch as undiciFetch } from "undici";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { saisonStartDate, currentSaisonCode } from "@/lib/utils/saison";
import { decodeObfuscatedScore } from "./score-font";
import { isReadableName } from "@/lib/players/readable-name";
import { cleanPlayerName } from "@/lib/players/person-name";
import { isPlausibleLeague } from "@/lib/utils/league";

/**
 * Audit 2026-05-24 Phase 5 / Task 5.2: User-Agent-Rotation gegen fussball.de-Bann.
 * Vorher statisch — bei häufigen Calls vom selben UA muster erkennt der Server.
 * Mix aus aktuellen Desktop-Browser-Strings (Chrome/Firefox/Safari, Mac+Win).
 */
const USER_AGENTS: ReadonlyArray<string> = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Backward-compat: alte Aufrufer kennen evtl. die Konstante. Random pro
// Module-Load → wenigstens unterschiedlich pro Inngest-Worker.
const USER_AGENT = pickUserAgent();

/**
 * Transient error patterns that justify a retry.
 * Network-level failures (DNS, TCP-RST, navigation timeouts) and 5xx upstream
 * errors are usually flaky — re-issuing the request often succeeds. Parse
 * errors or 4xx are programming/data bugs and must NOT be retried.
 */
const TRANSIENT_PATTERNS: ReadonlyArray<RegExp> = [
  /net::ERR_/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /Navigation timeout/i,
  /HTTP 5\d{2}/i,
];

export type RetryOptions = { maxAttempts: number; baseDelayMs?: number };

/**
 * Exponential-backoff retry wrapper. Re-throws non-transient errors immediately;
 * retries transient errors up to `maxAttempts` times with delay
 * `baseDelayMs * 2^(attempt-1)`.
 *
 * Pure async function — no side effects beyond `setTimeout`. Used by `withPage`
 * to harden Playwright launches against flaky network conditions.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = { maxAttempts: 3 }
): Promise<T> {
  const baseDelay = opts.baseDelayMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const transient = TRANSIENT_PATTERNS.some((p) => p.test(message));
      if (!transient || attempt === opts.maxAttempts) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // unreachable — loop always returns or throws
  throw lastErr;
}

/**
 * Beobachter für erfolgreiche fetchHtml-Antworten. AUSSCHLIESSLICH für die
 * Fixture-Capture-Pipeline (scripts/fixtures/capture-fixtures.ts): die schreibt
 * damit exakt die HTML-Seiten weg, die ein Live-Lauf tatsächlich holt — ohne
 * die Pagination-Logik (paginateTeamGames) im Script zu duplizieren. Im
 * Produktionsbetrieb immer null; der Hook feuert nur nach bestandenem
 * Block-/Captcha-Check und darf das Crawl-Verhalten nicht beeinflussen.
 */
let fetchHtmlObserver: ((url: string, html: string) => void) | null = null;

export function setFetchHtmlObserver(
  fn: ((url: string, html: string) => void) | null
): void {
  fetchHtmlObserver = fn;
}

/**
 * Holt eine fussball.de-Seite per plain HTTP (fetch) + HTML-Parser statt
 * headless-Browser. fussball.de liefert die relevanten Inhalte (Spiel-Liste,
 * Spiel-Detail inkl. Tor-Events, Kader) server-gerendert aus — ein echter
 * Browser ist nicht nötig.
 *
 * Entscheidend (verifiziert 2026-06-01): Die Bot-Detection von fussball.de
 * blockt den headless-Chromium von Datacenter-IPs (Prod-Crawl lieferte 0
 * Spiele), NICHT aber plain-HTTP-Requests (curl/fetch vom selben Prod-Server
 * liefert volle Daten). Plus: schneller, kein Chromium-im-Container, weniger
 * Fehlerquellen. Retry auf 5xx/Netzfehler via withRetry.
 */
async function fetchHtml(url: string): Promise<HTMLElement> {
  return withRetry(
    async () => {
      // WICHTIG: undici-fetch direkt, NICHT das globale `fetch`. Next.js patcht
      // globalThis.fetch (Caching/Instrumentierung); außerhalb eines Request-
      // Scopes (Inngest-Function) lieferte der Patch leere Responses → Crawler
      // bekam 0 Spiele, obwohl roher node-fetch im selben Container volle Daten
      // holt (verifiziert 2026-06-01). undici umgeht den Patch.
      const res = await undiciFetch(url, {
        headers: {
          "User-Agent": pickUserAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"
        },
        redirect: "follow"
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // transient
      if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
      const html = await res.text();
      if (process.env.CRAWL_DEBUG === "1") {
        console.log(`[fetchHtml] ${url.slice(0, 70)} → ${html.length}B`);
      }
      // Harte Block-/Captcha-Seite: nur bei KLEINER Seite + Block-Marker werfen.
      // Echte Seiten (Liste ~28 KB, Detail ~190 KB) referenzieren teils "captcha"
      // in Hidden-Forms → Längen-Guard verhindert False-Positives.
      // Marker decken die echte fussball.de-Sperrseite ab: Titel/H1
      // „Sicherheitsabfrage" + reCAPTCHA-iframe (recaptcha/api…). g-recaptcha
      // allein verfehlte beide → stiller Leer-Parse statt lautem Fehler.
      if (
        html.length < 3000 &&
        /g-recaptcha|recaptcha\/api|sicherheitsabfrage|datadome|captcha-delivery|zugriff verweigert|access denied/i.test(
          html
        )
      ) {
        throw new Error("Captcha/Sicherheitsabfrage-Seite erkannt");
      }
      fetchHtmlObserver?.(url, html);
      return parseHtml(html);
    },
    { maxAttempts: 3, baseDelayMs: 800 }
  );
}

/** Normalisiert Whitespace eines Parser-Nodes (analog textContent.trim()). */
function nodeText(el: { text?: string } | null | undefined): string {
  return normalizeTeamName(el?.text ?? "");
}

/**
 * Säubert einen von fussball.de stammenden Namen: entfernt unsichtbare Zeichen
 * (Zero-Width-Space U+200B, ZWNJ/ZWJ, BOM) und wandelt geschützte Leerzeichen in
 * normale um, bevor Whitespace kollabiert wird. fussball.de streut Zero-Width-
 * Spaces zwischen Pfad-Segmente von Spielgemeinschafts-Namen
 * ("Dossenheim/​Handschuhsheim") — ohne diese Bereinigung erscheint dieselbe
 * Mannschaft mehrfach mit scheinbar unterschiedlichem Namen.
 */
export function normalizeTeamName(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrahiert die Liga/Spielklasse aus dem Text einer `row-competition`-Zeile.
 *
 * Aktuelles fussball.de-Format ist PIPE-getrennt:
 *   "{Wochentag}, {Datum} | {Uhrzeit} {Altersklasse} | {Liga} | {Wettbewerb-ID}"
 *   z.B. "Sa, 23.05.26 | 14:00 C-Junioren | Oberliga ME | 390013130"
 * (der "Wochentag, Datum"-Block fehlt bei Folgespielen am selben Tag).
 * Die Liga ist das Segment VOR der rein-numerischen Wettbewerb-ID. Das Komma
 * trennt nur Wochentag/Datum — der alte `split(",")[0]` lieferte daher den
 * Wochentag ("So"/"Sa") als vermeintliche Liga (Bug 2026-06-03).
 *
 * Legacy-Format ohne Pipes (z.B. "Kreisliga A, Staffel 3, Herren") wird weiter
 * über das erste Komma-Segment behandelt. Implausible Werte (Wochentag/Uhrzeit/
 * Datum/ID) → `null`.
 */
export function extractLeagueFromCompetitionText(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  let candidate: string;
  if (text.includes("|")) {
    const parts = text
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    let idx = parts.length - 1;
    if (idx >= 0 && /^\d+$/.test(parts[idx])) idx -= 1; // trailing Wettbewerb-ID
    candidate = idx >= 0 ? parts[idx] : "";
  } else {
    candidate = text.split(",")[0].trim();
  }

  return isPlausibleLeague(candidate) ? candidate : null;
}

/**
 * Stable, content-addressed hash of the "interesting" parts of a scraped match.
 *
 * Used by the crawler to detect when a previously seen match has been edited on
 * fussball.de (e.g. result corrected, goal scorer reassigned, additional event
 * added) so we can re-evaluate triggers and invalidate stale charges.
 *
 * Hash is order-independent: events are sorted by (minute, type, side,
 * spielerId) before serialization. Null and undefined spielerId are treated as
 * equivalent so we don't churn hashes when the player-name resolver fails
 * intermittently.
 */
export type MatchHashInput = {
  ergebnisHeim: number;
  ergebnisGast: number;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  events: ReadonlyArray<{
    minute: number | null;
    type: string;
    side: "heim" | "gast";
    spielerId?: string | null;
  }>;
};

export function computeMatchHash(input: MatchHashInput): string {
  const normEvents = input.events.map((e) => ({
    minute: e.minute ?? -1,
    type: e.type ?? "",
    side: e.side,
    spielerId: e.spielerId ?? null,
  }));
  normEvents.sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) return typeCmp;
    const sideCmp = a.side.localeCompare(b.side);
    if (sideCmp !== 0) return sideCmp;
    return (a.spielerId ?? "").localeCompare(b.spielerId ?? "");
  });
  const payload = JSON.stringify({
    r: [input.ergebnisHeim, input.ergebnisGast],
    h: [input.halbzeitHeim, input.halbzeitGast],
    e: normEvents.map((e) => [e.minute, e.type, e.side, e.spielerId]),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export interface VereinHit {
  name: string;
  ort: string | null;
  slug: string;
  vereinId: string;
  url: string;
  isAlreadyClaimed?: boolean;
  claimedClubSlug?: string | null;
}

export interface MannschaftHit {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
}

/** Minimaler Form-Vertrag, den {@link dedupeMannschaften} zum Gruppieren braucht. */
export interface TeamIdentityLike {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
}

/**
 * Zerlegt einen Mannschaftsnamen in Alters-/Wettbewerbskategorie ("A-Junioren",
 * "Herren", "Frauen") und Vereins-/SG-Teil ("FC Sportfr. Dossenheim 2").
 */
function splitTeamName(name: string): { category: string; rest: string } {
  const clean = normalizeTeamName(name);
  const idx = clean.indexOf(" - ");
  if (idx < 0) return { category: "", rest: clean.toLowerCase() };
  return {
    category: clean.slice(0, idx).trim().toLowerCase(),
    rest: clean.slice(idx + 3).trim().toLowerCase(),
  };
}

/** Tokens, an deren letztem ein Mannschaftsname die Reservenummer trägt. */
const SQUAD_QUALIFIERS = new Set(["zg", "zugeordnet", "zg."]);

/**
 * Ermittelt die Mannschaftsnummer (1. = 1, "… 2" = 2, "… 2 zg." = 2). Nur eine
 * abschließende Zahl zählt — Jahreszahlen mitten im Vereinsnamen ("1910") nicht.
 */
function squadNumber(rest: string): number {
  const tokens = rest
    .replace(/[^a-z0-9äöüß ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length && SQUAD_QUALIFIERS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  const last = tokens[tokens.length - 1];
  return last && /^\d+$/.test(last) ? parseInt(last, 10) : 1;
}

/** Aussagekräftige Vereins-/Ortstokens (≥4 Zeichen, keine reinen Zahlen). */
function clubTokens(rest: string): Set<string> {
  return new Set(
    rest
      .replace(/[^a-z0-9äöüß ]/g, " ")
      .split(/[\s/]+/)
      .filter((t) => t.length >= 4 && /[a-zäöüß]/.test(t)),
  );
}

/**
 * Entscheidet, ob zwei fussball.de-Einträge dieselbe physische Mannschaft sind.
 * fussball.de listet dieselbe Mannschaft mehrfach mit je EIGENER teamId — daher
 * greift reine teamId-Dedup nicht. Voraussetzung ist immer gleiche Saison,
 * Kategorie ("A-Junioren") UND Reservenummer (so bleiben 1. und 2. Mannschaft
 * sowie verschiedene Altersklassen getrennt — fussball.de-Slugs kodieren die
 * Altersklasse NICHT). Sind die gleich, gelten zwei Einträge als identisch, wenn
 *  (a) der Slug übereinstimmt (Zero-Width-Space-Doppel), ODER
 *  (b) sich der Vereinsname ein aussagekräftiges Kernwort teilt ("FC Dossenheim"
 *      ≙ "FC Sportfr. Dossenheim"). Fremde Spielgemeinschaften ohne gemeinsames
 *      Kernwort fallen dadurch NICHT zusammen.
 */
function isSameTeam(a: TeamIdentityLike, b: TeamIdentityLike): boolean {
  if (a.saison !== b.saison) return false;

  const idA = splitTeamName(a.name);
  const idB = splitTeamName(b.name);
  if (!idA.category || idA.category !== idB.category) return false;
  if (squadNumber(idA.rest) !== squadNumber(idB.rest)) return false;

  const slugA = a.slug.trim().toLowerCase();
  const slugB = b.slug.trim().toLowerCase();
  if (slugA && slugA === slugB) return true;

  const tokensB = clubTokens(idB.rest);
  for (const t of clubTokens(idA.rest)) {
    if (tokensB.has(t)) return true;
  }
  return false;
}

/**
 * Faltet von fussball.de mehrfach gelistete Mannschaften auf je einen Eintrag
 * zusammen (siehe {@link isSameTeam}). `preferred` bestimmt bei einer Kollision
 * den Gewinner — Default: bestehender Eintrag bleibt (stabile Reihenfolge).
 * So lässt sich z.B. ein bereits registrierter Eintrag bevorzugt behalten.
 */
export function dedupeMannschaften<T extends TeamIdentityLike>(
  teams: T[],
  preferred?: (incoming: T, current: T) => boolean,
): T[] {
  const kept: T[] = [];
  for (const team of teams) {
    const idx = kept.findIndex((k) => isSameTeam(k, team));
    if (idx === -1) {
      kept.push(team);
    } else if (preferred?.(team, kept[idx])) {
      kept[idx] = team;
    }
  }
  return kept;
}

export interface SpielListItem {
  spielId: string;
  slug: string;
  datum: string; // DD.MM.YYYY
  heim: string;
  gast: string;
  ergebnis: string;
  /**
   * True wenn das Spiel-Datum in der Vergangenheit liegt (gespielt), false für
   * heutige/kommende Spiele (geplant). Früher hardcoded `true` — jetzt aus dem
   * Match-Datum abgeleitet, damit der `next.games`-Pfad korrekte Flags liefert.
   */
  vergangen: boolean;
  /**
   * Abgeleiteter Persistenz-Status für die DB. `finished` = gespielt (Detail-
   * Scrape + Charge-Emission erlaubt). `scheduled` = noch nicht gespielt
   * (KEINE Charges/Events — nur Stub-Row für die Spielplan-Ansicht).
   */
  status: "finished" | "scheduled";
  url: string;
  /**
   * Liga/Spielklasse aus der `row-competition`-Zeile des Listen-HTML (z.B.
   * "Kreisliga A"). Carry-over wie `datum`: gilt für alle Spiel-Zeilen unterhalb
   * der Wettbewerbs-Zeile. `null`, wenn keine Wettbewerbs-Zeile vorausging.
   */
  league: string | null;
}

export interface SpielDetails {
  spielId: string;
  heim: string;
  gast: string;
  /**
   * fussball.de-team-id der Heim-/Gast-Mannschaft (aus dem `.team-name`-Link der
   * Detailseite). Die EINDEUTIGE Team-Kennung — mit ihr bestimmt die Pipeline die
   * eigene Spielseite deterministisch (resolveTeamSide), statt über
   * kollisionsanfälliges Namens-Token-Matching. `null`, wenn der Link fehlt.
   */
  heimTeamId: string | null;
  gastTeamId: string | null;
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

/**
 * Asserts the current page is NOT a captcha / Sicherheitsabfrage page.
 *
 * fussball.de blocks aggressive scraping with a soft "Sicherheitsabfrage"
 * landing page or a reCAPTCHA iframe. If we silently parse such a page we'd
 * record zero matches/events and mistake them for real "no data" outcomes —
 * breaking trigger-evaluation downstream. Throw loudly instead so the crawl
 * job fails, alerts fire, and humans can investigate (rotating IP, slowing
 * down requests, etc.).
 *
 * Exported so unit tests can verify the detection logic against page stubs
 * and so parser-level negative-case tests can re-use the same helper.
 */
export async function assertNotCaptcha(page: Page): Promise<void> {
  const title = await page.title();
  if (/sicherheitsabfrage|captcha/i.test(title)) {
    throw new Error(`Captcha encountered on ${page.url()} — title: "${title}"`);
  }
  const hasRecaptcha = await page.locator('iframe[src*="recaptcha"]').count();
  if (hasRecaptcha > 0) {
    throw new Error(`Captcha (reCAPTCHA) encountered on ${page.url()}`);
  }
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  return withRetry(
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ userAgent: USER_AGENT });
        const page = await context.newPage();
        try {
          return await fn(page);
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    },
    { maxAttempts: 3, baseDelayMs: 1000 }
  );
}

export async function searchVereine(suchbegriff: string): Promise<VereinHit[]> {
  let results = await searchVereineRaw(suchbegriff);
  // fussball.de-Volltextsuche verschluckt sich an Gründungs-Jahreszahlen im
  // Vereinsnamen: "FC Sportfreunde 1910 Dossenheim" → 0 Treffer, "FC Sportfreunde
  // Dossenheim" → 1. Der User tippt aber genau den vollen offiziellen Namen (=
  // der bei uns gespeicherte Team-/Vereinsname). Fallback: stehende 2–4-stellige
  // Zahlen-Tokens (1910/1946/08 …) strippen und erneut suchen. Greift nur bei 0
  // Treffern → ändert nichts, wenn die Originalsuche schon liefert.
  if (results.length === 0) {
    const normalized = suchbegriff
      .replace(/\b\d{2,4}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized && normalized !== suchbegriff) {
      results = await searchVereineRaw(normalized);
    }
  }
  return results;
}

async function searchVereineRaw(suchbegriff: string): Promise<VereinHit[]> {
  // fetch statt Playwright: die /suche/-Seite ist server-gerendert (die
  // Verein-Treffer stehen im HTML). Robust auf Prod (kein headless-Block).
  const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(
    suchbegriff
  )}/restriction/-1`;
  let root: HTMLElement;
  try {
    root = await fetchHtml(url);
  } catch (err) {
    if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
    return [];
  }

  const results: VereinHit[] = [];
  const seen = new Set<string>();
  for (const link of root.querySelectorAll('a[href*="/verein/"]')) {
    const href = link.getAttribute("href") || "";
    const m = href.match(/\/verein\/([^/]+)\/-\/id\/([A-Z0-9]+)/);
    if (!m || seen.has(m[2])) continue;
    seen.add(m[2]);
    const raw = nodeText(link);
    // Address-Pattern "<Name> <5-stellige PLZ> <Ort>" abspalten, falls vorhanden
    const addr = raw.match(/^(.+?)\s+\d{5}\s+(.+)$/);
    const name = addr ? addr[1].trim() : raw || m[1];
    const ort = addr ? addr[2].trim() : null;
    results.push({
      name,
      ort,
      slug: m[1],
      vereinId: m[2],
      url: href.startsWith("http") ? href : `https://www.fussball.de${href}`
    });
  }
  return results;
}

/** Parst ein DD.MM.YYYY- oder DD.MM.YY-Datum zu einem Timestamp (ms) oder null. */
function parseSpielDatum(datum: string): number | null {
  const p = datum.split(".");
  if (p.length !== 3) return null;
  const y = p[2].length === 2 ? "20" + p[2] : p[2];
  const t = new Date(`${y}-${p[1]}-${p[0]}`).getTime();
  return isNaN(t) ? null : t;
}

/**
 * Vereinfachter URL-Slug aus Team-Name (Umlaute → ASCII, Sonderzeichen → Bindestrich).
 * Der Wert weicht vom echten fussball.de-Slug ab; er dient nur als Platzhalter
 * für Display-URLs. Alle AJAX-Calls (ajax.team.prev.games) benötigen nur teamId.
 */
function slugifyTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getMannschaften(
  vereinId: string,
  slug: string,
  vereinName?: string
): Promise<MannschaftHit[]> {
  // ─── Strategie A: Verein-Hauptseite, Sektion "Mannschaften des Vereins" ──
  // Die Vereinsseite ist server-gerendert (div.club-teams mit Mannschafts-
  // Links). fetch statt Playwright → prod-robust.
  let strategyAResults: MannschaftHit[] = [];
  try {
    const root = await fetchHtml(
      `https://www.fussball.de/verein/${slug}/-/id/${vereinId}`
    );
    const seen = new Set<string>();
    for (const link of root.querySelectorAll(
      'div.club-teams a[href*="/mannschaft/"]'
    )) {
      const href = link.getAttribute("href") || "";
      const m = href.match(
        /\/mannschaft\/([^/]+)\/-\/saison\/(\d{4})\/team-id\/([A-Z0-9]{20,})/
      );
      if (!m || seen.has(m[3])) continue;
      seen.add(m[3]);
      strategyAResults.push({
        name: nodeText(link) || m[1],
        slug: m[1],
        saison: m[2],
        teamId: m[3],
        url: href.startsWith("http") ? href : `https://www.fussball.de${href}`
      });
    }
  } catch (err) {
    if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
    // Strategie A gescheitert — Fallback auf B
  }

  // ─── Strategie B: ajax.club.matchplan (Fallback) ──────────────────────────
  // Nur wenn A 0 liefert. Liefert ALLE Teams aller Ligen des Vereins (inkl.
  // Gegner) → vereinName-AND-Filter unten zwingend.
  let strategyBResults: MannschaftHit[] = [];
  if (strategyAResults.length === 0) {
    try {
      const root = await fetchHtml(
        `https://www.fussball.de/ajax.club.matchplan/-/id/${vereinId}/mode/PAGE/show-filter/true`
      );
      const saison = currentSaisonCode();
      const seen = new Set<string>();
      for (const opt of root.querySelectorAll("select option[value]")) {
        const teamId = opt.getAttribute("value") || "";
        if (
          teamId.length < 20 ||
          !/^[A-Z0-9]+$/.test(teamId) ||
          seen.has(teamId)
        )
          continue;
        seen.add(teamId);
        const name = nodeText(opt);
        strategyBResults.push({
          name,
          slug: slugifyTeamName(name),
          saison,
          teamId,
          url: `https://www.fussball.de/mannschaft/${slugifyTeamName(
            name
          )}/-/saison/${saison}/team-id/${teamId}`
        });
      }
    } catch (err) {
      if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
    }
  }

  // ─── Merge + Deduplication ────────────────────────────────────────────────
  const seen = new Set<string>();
  const merged: MannschaftHit[] = [];
  for (const t of [...strategyAResults, ...strategyBResults]) {
    if (!seen.has(t.teamId)) {
      seen.add(t.teamId);
      merged.push(t);
    }
  }

  // Strategie A filtert bereits via div.club-teams — kein vereinName-Filter nötig.
  if (strategyAResults.length > 0) return merged;

  // ─── vereinName-Filter (nur für Strategie-B-Fallback) ────────────────────
  if (!vereinName) return merged;
  const tokens = vereinName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  if (tokens.length === 0) return merged;

  return merged.filter((team) => {
    const tLower = team.name.toLowerCase();
    return tokens.every((tok) => tLower.includes(tok));
  });
}

const IGNORE_TDS = new Set([
  ":",
  "Zum Spiel",
  "Nichtantritt GAST",
  "Nichtantritt HEIM"
]);

/**
 * Extrahiert Spiel-Zeilen aus dem geparsten fussball.de-Tabellen-HTML (Liste).
 * Port von `EXTRACT_MATCHES_JS` (vorher `page.evaluate`) auf node-html-parser —
 * läuft jetzt server-seitig ohne Browser. Logik identisch:
 *  - Datum kommt aus `row-headline`/`row-competition`-Zeilen (carry-over).
 *  - Heim/Gast über den ":"-Separator (robust gegen Datums-/Wettbewerb-Zellen).
 */
function extractMatchesFromHtml(root: HTMLElement): SpielListItem[] {
  const results: SpielListItem[] = [];
  const seen = new Set<string>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentDatum = "";
  let currentLeague: string | null = null;

  for (const tr of root.querySelectorAll("tr")) {
    if (
      tr.classList.contains("row-headline") ||
      tr.classList.contains("row-competition")
    ) {
      const txt = nodeText(tr);
      const dm = txt.match(/(\d{2}\.\d{2}\.\d{4})/);
      const dm2 = txt.match(/(\d{2}\.\d{2}\.\d{2})(?!\d)/);
      if (dm) currentDatum = dm[1];
      else if (dm2) currentDatum = dm2[1];
      // Die Wettbewerbs-Zeile trägt die Liga/Spielklasse — als carry-over für die
      // folgenden Spiel-Zeilen merken (überschreibt nur bei nicht-leerem Treffer).
      if (tr.classList.contains("row-competition")) {
        const league = extractLeagueFromCompetitionText(txt);
        if (league) currentLeague = league;
      }
      continue;
    }

    const link = tr.querySelector('a[href*="/spiel/"]');
    if (!link) continue;
    const href = link.getAttribute("href") || "";
    const m = href.match(/\/spiel\/([^/]+)\/-\/spiel\/([A-Z0-9]+)/);
    if (!m || seen.has(m[2])) continue;
    if (!currentDatum) continue;

    const parts = currentDatum.split(".");
    if (parts.length !== 3) continue;
    const yr = parts[2].length === 2 ? "20" + parts[2] : parts[2];
    const matchDate = new Date(`${yr}-${parts[1]}-${parts[0]}`);
    if (isNaN(matchDate.getTime())) continue;
    const vergangen = matchDate < today;

    const tds = tr.querySelectorAll("td").map((td) => nodeText(td));
    // Heim = nächste nicht-leere Zelle VOR dem ersten ":", Gast = danach.
    let sepIdx = -1;
    for (let i = 0; i < tds.length; i++) {
      if (tds[i] === ":") {
        sepIdx = i;
        break;
      }
    }
    let heim = "";
    let gast = "";
    if (sepIdx > 0) {
      for (let h = sepIdx - 1; h >= 0; h--) {
        if (tds[h] && !IGNORE_TDS.has(tds[h])) {
          heim = tds[h];
          break;
        }
      }
      for (let g = sepIdx + 1; g < tds.length; g++) {
        if (tds[g] && !IGNORE_TDS.has(tds[g])) {
          gast = tds[g];
          break;
        }
      }
    }
    if (!heim || !gast) continue; // kein sauberer Separator → überspringen

    seen.add(m[2]);
    const fullHref = href.startsWith("http")
      ? href
      : `https://www.fussball.de${href}`;
    // Datum IMMER als DD.MM.YYYY speichern. Die `row-competition`-Zeile liefert
    // ein 2-stelliges Jahr ("30.05.26"); `validateSpielListItem` verlangt aber
    // DD.MM.YYYY und verwirft sonst ALLE Spiele (skippedInvalid) → nichts wird
    // persistiert. `yr` ist oben bereits 4-stellig normalisiert.
    results.push({
      spielId: m[2],
      slug: m[1],
      datum: `${parts[0]}.${parts[1]}.${yr}`,
      heim,
      gast,
      ergebnis: "",
      vergangen,
      status: vergangen ? "finished" : "scheduled",
      url: fullHref,
      league: currentLeague
    });
  }

  return results;
}

/** fussball.de returns ~10 matches per page; 8 pages ≈ 80 matches covers a full season. */
const MAX_PAGES = 8;

/**
 * Paginiert einen `ajax.team.{prev|next}.games`-Endpoint durch und merged die
 * extrahierten Spiele in `into`. Bricht ab, sobald eine Seite leer ist oder nur
 * noch Duplikate liefert (Pagination erschöpft). Captcha-Fehler werden laut
 * durchgereicht — sonst still abgebrochen (Netz-Hickup ist tolerierbar, andere
 * Strategien liefern dann die Daten).
 *
 * `kind` bestimmt sowohl die URL ("prev" = vergangene, "next" = kommende Spiele)
 * ALS AUCH den `status`: prev → "finished" (Ergebnis liegt vor), next →
 * "scheduled" (angesetzt, kein Ergebnis). Das verhindert 0:0-Phantome bei
 * Spielen, deren Datum vorbei ist, deren Ergebnis fussball.de aber noch nicht
 * eingetragen hat (die bleiben in next.games → scheduled). `vergangen` bleibt
 * rein datumsbasiert (nur intern, wird downstream nicht gelesen).
 */
async function paginateTeamGames(
  kind: "prev" | "next",
  teamId: string,
  into: Map<string, SpielListItem>,
  saison?: string
): Promise<void> {
  for (let idx = 0; idx < MAX_PAGES; idx++) {
    // SECURITY (M2): URL-Segmente encodieren — Defense-in-depth gegen
    // path-manipulierende Werte (Validierung im Onboarding ist die erste Linie).
    const base = `https://www.fussball.de/ajax.team.${kind}.games/-/mode/PAGE/team-id/${encodeURIComponent(teamId)}`;
    const saisonSeg = saison ? `/saison/${encodeURIComponent(saison)}` : "";
    const indexSeg = idx === 0 ? "" : `/index/${idx}`;
    const ajaxUrl = `${base}${saisonSeg}${indexSeg}`;
    try {
      const root = await fetchHtml(ajaxUrl);
      const pageResults = extractMatchesFromHtml(root);

      // Status NICHT vom Datum, sondern vom ENDPOINT ableiten: `next.games`
      // liefert ANGESETZTE Spiele (ohne Ergebnis) — auch wenn ihr Datum schon
      // vorbei ist, weil fussball.de das Ergebnis noch nicht nachgeführt hat.
      // Würden wir sie per `matchDate < today` als "finished" klassifizieren,
      // scrapt der Detail-Scrape 0 Tore → ein 0:0-Phantom landet in der DB
      // (Bug: zukünftiges/ungespieltes Spiel mit 0:0). Erst wenn das Ergebnis
      // eingetragen ist, wandert das Spiel nach `prev.games` → dann "finished".
      const endpointStatus = kind === "prev" ? "finished" : "scheduled";
      for (const r of pageResults) {
        r.status = endpointStatus;
      }

      if (pageResults.length === 0) break; // no more data
      let newCount = 0;
      for (const r of pageResults) {
        if (!into.has(r.spielId)) {
          into.set(r.spielId, r);
          newCount++;
        }
      }
      if (newCount === 0) break; // all duplicates → pagination exhausted
    } catch (err) {
      // Captcha errors are loud signals — rethrow so the whole crawl fails.
      if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
      break;
    }
  }
}

/**
 * Liefert alle Spiele einer Mannschaft — VERGANGENE und KOMMENDE — für die
 * komplette Saison (soweit fussball.de das hergibt).
 *
 * Strategien (in dieser Reihenfolge gemerged, dedupliziert per spielId):
 *   1a. ajax.team.prev.games (ohne saison)  — ~10 jüngste vergangene Spiele
 *   1b. ajax.team.prev.games + saison        — Hinrunde der angefragten Saison
 *   1c. ajax.team.next.games (ohne saison)   — ~10 kommende Spiele
 *   1d. ajax.team.next.games + saison        — kommende Spiele der Saison
 *   2.  Haupt-Team-Seite Spielplan + Hinrunde-Tab
 *
 * Jedes Item bekommt `status` ("finished"/"scheduled") aus dem ENDPOINT
 * abgeleitet (prev=finished, next=scheduled) — NICHT aus dem Datum. Der Caller
 * (crawl-matches) entscheidet darüber, ob Detail-Scrape + Charges laufen. So
 * landet ein Spiel, dessen Ergebnis noch nicht eingetragen ist, nie als 0:0 in
 * der DB (es bleibt scheduled, bis es nach prev.games wandert).
 *
 * KNOWN LIMITATION / TODO (Phase 8): Für Mannschaften ganz am Saisonanfang
 * (alle Spiele in der Zukunft) oder mit >~10 noch ausstehenden Spielen kann die
 * Saison unvollständig sein — fussball.de cappt `prev`/`next` bei ~10 und
 * ignoriert teils den saison-Parameter. Der robuste Weg wäre der Liga-Spielplan
 * über die `wam_competitions_*.json` → Spieltagsübersicht (`/spieltagsuebersicht/
 * .../-/staffel/{staffelId}-G`), gefiltert auf den Team-Namen. Das ist mehrstufig
 * (Detail-Seite → competition-JSON → staffel-Seiten → Namens-Match über
 * Vorsaison-Aliase) und captcha-riskant; bewusst NICHT in diesem Backend-Change.
 * prev+next decken in der laufenden Saison den Großteil ab.
 */
export async function getSpiele(
  teamId: string,
  slug: string,
  saison: string
): Promise<SpielListItem[]> {
  void slug; // nicht mehr genutzt (Haupt-Team-Seite entfernt) — Signatur stabil
  const allResults = new Map<string, SpielListItem>();

  // Vergangene Spiele (ohne + mit saison-Parameter). `prev.games` liefert die
  // jüngsten gespielten Spiele SAUBER geparst (echte Vereinsnamen).
  await paginateTeamGames("prev", teamId, allResults);
  await paginateTeamGames("prev", teamId, allResults, saison);

  // Kommende Spiele (ohne + mit saison-Parameter). Gleiche Tabellen-Struktur.
  await paginateTeamGames("next", teamId, allResults);
  await paginateTeamGames("next", teamId, allResults, saison);

  // HINWEIS: Die Haupt-Team-Seite (`/mannschaft/{slug}/.../saison/{saison}`)
  // wird BEWUSST NICHT gescraped. Sie war Quelle von Saison-Pollution (alte
  // Vorsaison-Spiele) + Parse-Korruption. prev/next.games decken die laufende
  // Saison sauber ab; bei aktivem Crawl akkumuliert die DB die Saison.

  // Saison-Filter: nur Spiele AB Saisonstart (1. Juli des Saison-Codes). Keine
  // Obergrenze → kommende (auch nächste Saison) Spiele bleiben erhalten.
  const start = saisonStartDate(saison);
  const startMs = start ? start.getTime() : null;

  const raw = Array.from(allResults.values()).filter((g) => {
    const t = parseSpielDatum(g.datum);
    if (t === null) return false;
    if (startMs !== null && t < startMs) return false;
    return true;
  });

  raw.sort((a, b) => {
    const ta = parseSpielDatum(a.datum) ?? 0;
    const tb = parseSpielDatum(b.datum) ?? 0;
    return tb - ta;
  });

  // Observability: 1 Zeile pro Team in den Container-Logs — zeigt sofort, ob
  // der fetch-Crawler auf Prod tatsächlich Spiele zieht (Diagnose Prod ≠ lokal).
  console.log(
    `[getSpiele] team=${teamId.slice(0, 8)} saison=${saison} → ${allResults.size} roh, ${raw.length} nach Saison-Filter`
  );

  return raw;
}

const playerNameCache = new Map<string, string>();

function extractPlayerIdFromUrl(url: string): string | null {
  const m = url.match(/\/(?:player-id|userid)\/([A-Z0-9]+)/i);
  return m ? m[1] : null;
}

async function resolvePlayerName(playerUrl: string): Promise<string> {
  const id = extractPlayerIdFromUrl(playerUrl);
  if (!id) return playerUrl;
  if (playerNameCache.has(id)) return playerNameCache.get(id)!;

  try {
    const root = await fetchHtml(playerUrl);
    const title = nodeText(root.querySelector("title"));
    const m = title.match(/^(.+?)\s*(?:Basisprofil|Profil|\|)/i);
    const name = (m ? m[1].trim() : title.split("|")[0].trim()) || id;
    playerNameCache.set(id, name);
    return name;
  } catch (err) {
    if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
    playerNameCache.set(id, id);
    return id;
  }
}

/**
 * Liest die ANGEZEIGTE HALBZEIT aus dem `.result`-Element der Detailseite.
 *
 * fussball.de rendert dort `<span class="half-result">[H : G]</span>` — die
 * eckige Klammer ist IMMER die Halbzeit, NIEMALS der Endstand ("[- : -]" wenn
 * nicht eingetragen). Der Endstand daneben (`.end-result`) ist font-verschleiert
 * und wird via `decodeObfuscatedScore` (score-font.ts) dekodiert.
 *
 * ACHTUNG Bug-Historie 2026-06-09/10: diese Klammer wurde als Endstand
 * interpretiert ("parseDisplayedResult") — dadurch überschrieb der Crawler
 * 63 Endstände mit Halbzeitständen. Nie wieder als Endstand lesen.
 */
export function parseDisplayedHalftime(
  root: HTMLElement
): { heim: number; gast: number } | null {
  // Gezielt .half-result; Fallback auf das ganze .result-Element (die Klammer
  // kommt dort nur in der Halbzeit-Anzeige vor, der Endstand ist verschleiert).
  const el = root.querySelector(".result .half-result") ?? root.querySelector(".result");
  const txt = nodeText(el).replace(/\s+/g, " ");
  const m = txt.match(/\[\s*(\d+)\s*:\s*(\d+)\s*\]/);
  if (!m) return null;
  return { heim: parseInt(m[1], 10), gast: parseInt(m[2], 10) };
}

/**
 * Zieht die fussball.de-team-id aus dem Mannschafts-Link einer Spiel-Seite
 * (`{selector} .team-name a[href*="team-id"]`). Rückgabe `null`, wenn die Seite
 * den Link nicht enthält (z.B. Layout-Änderung) — der Aufrufer fällt dann auf
 * Namens-Matching zurück statt zu raten.
 */
function extractTeamIdFromSection(
  root: HTMLElement,
  selector: string
): string | null {
  for (const a of root.querySelectorAll(`${selector} a[href*="team-id"]`)) {
    const m = (a.getAttribute("href") || "").match(/team-id\/([A-Z0-9]{20,})/i);
    if (m) return m[1];
  }
  return null;
}

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  const url = `https://www.fussball.de/spiel/${slug || "spiel"}/-/spiel/${spielId}`;
  const root = await fetchHtml(url);

  const heim = nodeText(root.querySelector(".team-home .team-name"));
  const gast = nodeText(root.querySelector(".team-away .team-name"));

  // Eindeutige fussball.de-team-id beider Seiten aus dem Mannschafts-Link ziehen
  // (`.team-name a[href*="team-id"]`). Sie ist die verlässliche Kennung, mit der
  // downstream die eigene Spielseite deterministisch bestimmt wird — Namen
  // kollidieren bei Reserve-Derbys / gleicher Stadt.
  const heimTeamId = extractTeamIdFromSection(root, ".team-home");
  const gastTeamId = extractTeamIdFromSection(root, ".team-away");

  const matchCourse = root.querySelector(".match-course");
  const rowEvents = matchCourse
    ? matchCourse.querySelectorAll(".row-event")
    : [];

  type RawEv = {
    typ: "TOR" | "AUSWECHSLUNG";
    minute: number | null;
    side: "heim" | "gast" | "unbekannt";
    playerLinks: string[];
  };
  const rawEvents: RawEv[] = [];
  const spielerUrls: string[] = [];

  for (const row of rowEvents) {
    const isRight = row.classList.contains("event-right");
    const isLeft = row.classList.contains("event-left");
    const valign = row.querySelector(".valign-inner");
    const minuteStr = valign
      ? nodeText(valign).replace(/\s+/g, "").replace(/'/g, "")
      : "";
    const isGoal = row.querySelector(".hexagon.green") !== null;
    const isSubstitute = row.querySelector(".icon-substitute") !== null;
    const playerLinks = row
      .querySelectorAll('a[href*="spielerprofil"]')
      .map((a) => a.getAttribute("href") || "")
      .filter((h) => h.includes("/player-id/") || h.includes("/userid/"))
      .map((h) => (h.startsWith("http") ? h : `https://www.fussball.de${h}`));

    const side = isRight ? "gast" : isLeft ? "heim" : "unbekannt";
    const minuteNum = minuteStr ? parseInt(minuteStr, 10) : NaN;
    const minute = isNaN(minuteNum) ? null : minuteNum;

    if ((isGoal || isSubstitute) && playerLinks.length > 0) {
      rawEvents.push({
        typ: isGoal ? "TOR" : "AUSWECHSLUNG",
        minute,
        side,
        playerLinks
      });
      for (const u of playerLinks) {
        if (!spielerUrls.includes(u)) spielerUrls.push(u);
      }
    }
  }

  const goals = rawEvents.filter((e) => e.typ === "TOR");
  // Endstand PRIMÄR aus dem dekodierten Anzeige-Score (`.end-result`,
  // Obfuscation-Font) — der ist auch für „nur Ergebnis"-Mannschaften (kein
  // Spielbericht → 0 Tor-Events) korrekt, wo die Event-Zählung 0:0 liefert.
  // Fallback: Tor-Events zählen (bei vollem Spielbericht identisch → kein
  // Hash-Drift). Die Klartext-Klammer "[H : G]" ist die HALBZEIT — sie als
  // Endstand zu lesen war der Korruptions-Bug vom 2026-06-09/10.
  const displayedEnd = await decodeObfuscatedScore(root);
  const ergebnisHeim = displayedEnd
    ? displayedEnd.heim
    : goals.filter((g) => g.side === "heim").length;
  const ergebnisGast = displayedEnd
    ? displayedEnd.gast
    : goals.filter((g) => g.side === "gast").length;
  // Halbzeit PRIMÄR aus der angezeigten Klammer (offizieller HZ-Stand, auch
  // ohne Spielbericht vorhanden); Fallback: Tor-Events mit Minute ≤ 45.
  const displayedHalftime = parseDisplayedHalftime(root);
  const firstHalfGoals = goals.filter(
    (g) => g.minute !== null && g.minute <= 45
  );
  const halbzeitHeim =
    displayedHalftime?.heim ??
    firstHalfGoals.filter((g) => g.side === "heim").length;
  const halbzeitGast =
    displayedHalftime?.gast ??
    firstHalfGoals.filter((g) => g.side === "gast").length;

  // Spielernamen auflösen (gecached, sequenziell mit kleinem Delay gegen
  // Rate-Limiting). Jede Profilseite ist ein einzelner leichter fetch.
  for (const u of spielerUrls) {
    const id = extractPlayerIdFromUrl(u);
    if (!id || playerNameCache.has(id)) continue;
    await new Promise((r) => setTimeout(r, 250));
    await resolvePlayerName(u);
  }

  const events: ScrapedEvent[] = rawEvents.map((ev) => {
    if (ev.typ === "TOR" && ev.playerLinks[0]) {
      const id = extractPlayerIdFromUrl(ev.playerLinks[0]);
      return {
        typ: "TOR",
        minute: ev.minute,
        side: ev.side,
        spielerId: id ?? undefined,
        spielerName: id ? (playerNameCache.get(id) ?? id) : undefined
      };
    }
    if (ev.typ === "AUSWECHSLUNG" && ev.playerLinks.length >= 2) {
      const reinId = extractPlayerIdFromUrl(ev.playerLinks[0]);
      const rausId = extractPlayerIdFromUrl(ev.playerLinks[1]);
      return {
        typ: "AUSWECHSLUNG",
        minute: ev.minute,
        side: ev.side,
        rein: {
          id: reinId ?? "",
          name: reinId ? (playerNameCache.get(reinId) ?? reinId) : ""
        },
        raus: {
          id: rausId ?? "",
          name: rausId ? (playerNameCache.get(rausId) ?? rausId) : ""
        }
      };
    }
    return { typ: ev.typ, minute: ev.minute, side: ev.side };
  });

  events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

  return {
    spielId,
    heim,
    gast,
    heimTeamId,
    gastTeamId,
    ergebnis: { heim: ergebnisHeim, gast: ergebnisGast },
    // Halbzeit: angezeigte "[H : G]"-Klammer, sonst Tor-Events (Minute ≤ 45).
    // Wie zuvor immer als Objekt (auch 0:0) — NICHT null, sonst ändert sich der
    // content-hash aller bestehenden Matches und löst unnötige Re-Evaluation aus.
    halbzeit: { heim: halbzeitHeim, gast: halbzeitGast },
    events
  };
}

export interface KaderPlayer {
  name: string;
  spielerId?: string;
}

export async function getKader(
  teamId: string,
  _slug: string,
  saison: string
): Promise<KaderPlayer[]> {
  // Der offizielle Kader liegt auf dem server-gerenderten AJAX-Fragment
  // `ajax.team.squad` (kein Browser/JS nötig — analog ajax.team.prev.games).
  // WICHTIG (Probe 2026-06-11): fussball.de gibt den Kader nur frei, wenn der
  // Team-Admin ihn aktiv VERÖFFENTLICHT hat. Sonst liefert das Fragment „Die
  // Kaderliste ist bisher nicht zur Veröffentlichung freigegeben" + leere
  // Tabelle. Die frühere getKader scrapte fälschlich die Mannschafts-Startseite
  // (Aktuelles-Tab, kein Kader) und holte dort Match-Bericht-Überschriften.
  // SECURITY (M2): teamId/saison URL-encodieren (Defense-in-depth).
  const url = `https://www.fussball.de/ajax.team.squad/-/mode/PAGE/order-by/1/saison/${encodeURIComponent(
    saison
  )}/show-filter/true/team-id/${encodeURIComponent(teamId)}`;

  let root: HTMLElement;
  try {
    root = await fetchHtml(url);
  } catch (err) {
    if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
    return [];
  }

  // Privater (nicht freigegebener) Kader → kein Spieler. Der Pool fällt dann
  // auf die Torschützen aus match_events zurück (getTeamPlayerPool).
  if (/nicht zur Veröffentlichung freigegeben/i.test(root.text)) return [];

  // Kader-Zeilen: td.column-player > a.player-wrapper (href = spielerprofil-ID),
  // Name in div.player-name als font-obfuskierte PUA-Glyphen.
  const raw: Array<{ id: string | null; href: string }> = [];
  const seen = new Set<string>();
  for (const link of root.querySelectorAll(
    'td.column-player a[href*="spielerprofil"]'
  )) {
    const href = link.getAttribute("href") || "";
    const idMatch = href.match(/\/(?:player-id|userid)\/([A-Z0-9]+)/i);
    const id = idMatch ? idMatch[1] : null;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    raw.push({
      id,
      href: href.startsWith("http") ? href : `https://www.fussball.de${href}`
    });
  }

  // Namen sind font-obfuskiert (Private Use Area) → über die Spieler-Profilseite
  // auflösen (gleicher Cache wie Torschützen in getSpielDetails), sequenziell mit
  // kleinem Delay gegen Rate-Limiting. So landet der VOLLE, lesbare Kader in der
  // DB — auch Spieler, die nie getroffen haben. Unauflösbare Namen werden
  // verworfen (lieber kein Eintrag als Tofu).
  const out: KaderPlayer[] = [];
  for (const p of raw) {
    const id = extractPlayerIdFromUrl(p.href);
    if (id && !playerNameCache.has(id)) {
      await new Promise((r) => setTimeout(r, 250));
    }
    // Der Roh-Profilname trägt oft den Suffix „(Verein) Spieler" — da der Kader
    // team-scoped ist (alle = eigener Verein), unbedenklich strippen.
    const name = cleanPlayerName(await resolvePlayerName(p.href));
    if (isReadableName(name)) {
      out.push({ name, spielerId: p.id ?? undefined });
    }
  }
  return out;
}

/** Verschiebt einen Saison-Code ("2526") um `delta` Jahre (-1 → "2425"). */
export function shiftSaisonCode(code: string, delta: number): string {
  const startYY = parseInt(code.slice(0, 2), 10);
  if (Number.isNaN(startYY)) return code;
  const startYear = 2000 + startYY + delta;
  const yy = (n: number) => String(((n % 100) + 100) % 100).padStart(2, "0");
  return yy(startYear) + yy(startYear + 1);
}

/**
 * Kader über die aktuelle + die letzten `depth` Saisons vereinen. fussball.de
 * gibt einen Kader nur frei, wenn der Verein ihn aktiv veröffentlicht — viele
 * tun das gar nicht oder nur in einer einzelnen Saison. Bewusst GROSSZÜGIG: für
 * „Tore von Spieler X" lieber einen Ex-Spieler zu viel im Dropdown als einen zu
 * wenig (Spieler-Pool soll möglichst vollständig sein). Die team-id ist über
 * Saisons stabil, also liefern Vorsaison-Abfragen die damaligen Kader. Dedup
 * über die fussball.de-Spieler-ID; die aktuelle Saison gewinnt beim Anzeigenamen.
 */
export async function getSquadAcrossSeasons(
  teamId: string,
  slug: string,
  currentSaison: string,
  depth = 2
): Promise<KaderPlayer[]> {
  const codes = [currentSaison];
  for (let i = 1; i <= depth; i++) {
    const prev = shiftSaisonCode(currentSaison, -i);
    if (!codes.includes(prev)) codes.push(prev);
  }

  const byId = new Map<string, KaderPlayer>();
  const withoutId: KaderPlayer[] = [];
  for (const saison of codes) {
    let kader: KaderPlayer[] = [];
    try {
      kader = await getKader(teamId, slug, saison);
    } catch {
      // Eine einzelne Vorsaison-Abfrage darf den Gesamt-Scrape nicht kippen.
    }
    for (const p of kader) {
      if (p.spielerId) {
        if (!byId.has(p.spielerId)) byId.set(p.spielerId, p);
      } else {
        withoutId.push(p);
      }
    }
  }
  return [...byId.values(), ...withoutId];
}

/* ─── Liga-Tabelle (volle-Saison-Aggregate, verifizierbar) ──────────────────── */

export interface LeagueStandingRow {
  position: number;
  teamName: string;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  toreFor: number;
  toreAgainst: number;
  punkte: number;
}

/** Eine Zeile der Liga-Torschützenliste (Staffel-weit). */
export interface LeagueTopScorer {
  position: number;
  name: string;
  /** fussball.de-Spieler-ID (matcht match_events.spielerId/Kader), null möglich. */
  userid: string | null;
  teamName: string;
  /** fussball.de-team-id aus dem Mannschafts-Link der Zeile (Eigen-Match), null möglich. */
  teamId: string | null;
  tore: number;
}

/** Fairnesstabellen-Zeile der eigenen Mannschaft (Staffel-weit). */
export interface LeagueFairnessRow {
  position: number;
  teamName: string;
  spiele: number;
  gelb: number;
  gelbRot: number;
  rot: number;
  /** Karten pro Spiel (fussball.de-Quote). */
  quote: number;
}

export interface LeagueStandings {
  teamsInLeague: number;
  rows: LeagueStandingRow[];
  /** Zeile der eigenen Mannschaft (Namens-Match), null wenn nicht gefunden. */
  ownRow: LeagueStandingRow | null;
  /**
   * Wrapped-Extras (Spec 2026-07-06), best-effort im selben Browser-Lauf:
   * Liga-Torschützenliste + Fairnesstabelle der Staffel. Undefined/leer, wenn
   * die Staffel-ID nicht gefunden wurde oder der Extra-Scrape scheiterte — das
   * Wrapped blendet die Slides dann einfach aus.
   */
  staffelId?: string | null;
  /** Top der Liga-Torschützenliste (~30). */
  topScorers?: LeagueTopScorer[];
  /** Eigene Spieler in der Liga-Torschützenliste (mit Liga-Platz), best-first. */
  ownTopScorers?: LeagueTopScorer[];
  /** Fairness-Platz der eigenen Mannschaft + Ligagröße. */
  fairnessOwnRow?: LeagueFairnessRow | null;
  fairnessTeamsInLeague?: number;
}

/**
 * Liga-Tabelle einer Mannschaft (volle Saison als AGGREGAT — Spiele, S/U/N,
 * Tore, Punkte, Platz). Quelle der Wahrheit für die großen Wrapped-Zahlen, die
 * sich aus den ~10 live gescrapten Spielen NICHT vollständig ergeben.
 *
 * BROWSER, nicht fetch: der ajax.team.table-Endpoint blockt plain HTTP hart
 * (Datadome-Sperrseite), nur der echte Browser kommt durch. Daher withPage.
 * Selten aufgerufen (1×/Team/Saison), also vertretbar.
 */
export async function getLeagueStandings(
  teamId: string,
  slug: string,
  saison: string,
  ownClubName: string
): Promise<LeagueStandings | null> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/mannschaft/${encodeURIComponent(
      slug
    )}/-/saison/${encodeURIComponent(saison)}/team-id/${encodeURIComponent(
      teamId
    )}#!/section/table`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await assertNotCaptcha(page);
    await page.waitForTimeout(3000);

    const raw = (await page.evaluate(`(function(){
      var out = [];
      document.querySelectorAll('tr').forEach(function(tr){
        var tds = [];
        tr.querySelectorAll('td').forEach(function(td){
          var t = (td.textContent||'').replace(/\\s+/g,' ').trim();
          if (t) tds.push(t);
        });
        // Echte Tabellenzeile: erste Zelle ist die Platzierung ("6.").
        if (tds.length >= 6 && /^\\d+\\.$/.test(tds[0])) out.push(tds);
      });
      return out;
    })()`)) as string[][];

    const rows: LeagueStandingRow[] = [];
    const seenPos = new Set<number>();
    for (const tds of raw) {
      const position = parseInt(tds[0], 10);
      if (seenPos.has(position)) continue; // Tabelle kann doppelt im DOM stehen.
      seenPos.add(position);
      const toreCell = tds.find((t) => /^\d+\s*:\s*\d+$/.test(t));
      const tm = toreCell?.match(/^(\d+)\s*:\s*(\d+)$/);
      rows.push({
        position,
        teamName: normalizeTeamName(tds[1] ?? ""),
        spiele: parseInt(tds[2] ?? "0", 10) || 0,
        siege: parseInt(tds[3] ?? "0", 10) || 0,
        unentschieden: parseInt(tds[4] ?? "0", 10) || 0,
        niederlagen: parseInt(tds[5] ?? "0", 10) || 0,
        toreFor: tm ? parseInt(tm[1], 10) : 0,
        toreAgainst: tm ? parseInt(tm[2], 10) : 0,
        punkte: parseInt(tds[tds.length - 1] ?? "0", 10) || 0
      });
    }
    if (rows.length === 0) return null;

    // Eigene Zeile: alle distinktiven Tokens des Klub-Namens müssen vorkommen.
    const ownTokens = normalizeTeamName(ownClubName)
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const ownRow =
      ownTokens.length > 0
        ? rows.find((r) => {
            const rn = r.teamName.toLowerCase();
            return ownTokens.every((t) => rn.includes(t));
          }) ?? null
        : null;

    // ── Wrapped-Extras: Staffel-ID → Torschützen + Fairness (best-effort) ──
    // Die Staffel-ID steht im Team-Seiten-HTML (u.a. in den fairness-Links).
    // Format: 10+ alphanum + "-" + Buchstabe, z.B. 02TIQ…DEIN-G.
    let staffelId: string | null = null;
    let topScorers: LeagueTopScorer[] = [];
    let ownTopScorers: LeagueTopScorer[] = [];
    let fairnessOwnRow: LeagueFairnessRow | null = null;
    let fairnessTeamsInLeague = 0;
    try {
      // Die Team-Seite verlinkt mehrere Staffeln (Footer-Widgets: Bundesliga etc.).
      // Die EIGENE Liga steht im Link mit unserer team-id bzw. im Fairness-Link —
      // die naive First-Match-Regex würde eine fremde Staffel greifen.
      staffelId = (await page.evaluate(`(function(){
        var html = document.documentElement.outerHTML;
        var own = html.match(/staffel\\/([A-Z0-9]{10,}-[A-Z])\\/team-id\\/${teamId}/);
        if (own) return own[1];
        var fair = html.match(/ajax\\.team\\.table\\.fairness\\/-\\/saison\\/\\d+\\/staffel\\/([A-Z0-9]{10,}-[A-Z])\\/team-id/);
        if (fair) return fair[1];
        var any = html.match(/staffel\\/([A-Z0-9]{10,}-[A-Z])/);
        return any ? any[1] : null;
      })()`)) as string | null;

      if (staffelId) {
        // Torschützenliste der Staffel (eigene Seite, nicht ajax.team.*).
        await page.goto(
          `https://www.fussball.de/torjaeger/-/staffel/${encodeURIComponent(staffelId)}`,
          { waitUntil: "networkidle", timeout: 30000 }
        );
        await page.waitForTimeout(1500);
        const scRaw = (await page.evaluate(`(function(){
          var out = [];
          document.querySelectorAll('tr').forEach(function(tr){
            var prof = tr.querySelector('a[href*="spielerprofil"]');
            if (!prof) return;
            var tds = [];
            tr.querySelectorAll('td').forEach(function(td){
              var t = (td.textContent||'').replace(/\\s+/g,' ').trim();
              tds.push(t);
            });
            if (tds.length < 4) return;
            var uid = (prof.getAttribute('href')||'').match(/userid\\/([A-Z0-9]+)/);
            var teamA = tr.querySelector('a[href*="team-id"]');
            var tid = teamA ? (teamA.getAttribute('href')||'').match(/team-id\\/([A-Z0-9]+)/) : null;
            out.push({
              cells: tds.filter(function(t){ return t.length>0; }),
              userid: uid ? uid[1] : null,
              teamId: tid ? tid[1] : null
            });
          });
          return out;
        })()`)) as { cells: string[]; userid: string | null; teamId: string | null }[];

        for (const r of scRaw) {
          const position = parseInt(r.cells[0] ?? "", 10);
          const tore = parseInt(r.cells[r.cells.length - 1] ?? "", 10);
          if (!Number.isFinite(position) || !Number.isFinite(tore)) continue;
          topScorers.push({
            position,
            name: r.cells[1] ?? "",
            userid: r.userid,
            teamName: normalizeTeamName(r.cells[2] ?? ""),
            teamId: r.teamId,
            tore
          });
        }
        // Eigene Spieler = Torschützen-Zeilen mit unserer team-id (exakt, kein Fuzzy).
        ownTopScorers = topScorers
          .filter((s) => s.teamId === teamId)
          .sort((a, b) => a.position - b.position);

        // Fairnesstabelle (ajax-Fragment, Browser umgeht Datadome).
        await page.goto(
          `https://www.fussball.de/ajax.team.table.fairness/-/saison/${encodeURIComponent(
            saison
          )}/staffel/${encodeURIComponent(staffelId)}/team-id/${encodeURIComponent(teamId)}`,
          { waitUntil: "networkidle", timeout: 30000 }
        );
        await page.waitForTimeout(1200);
        const fairRaw = (await page.evaluate(`(function(){
          var out = [];
          document.querySelectorAll('tr').forEach(function(tr){
            var tds = [];
            tr.querySelectorAll('td').forEach(function(td){
              var t = (td.textContent||'').replace(/\\s+/g,' ').trim();
              tds.push(t);
            });
            if (tds.length >= 5 && /^\\d+\\.$/.test(tds[0])) out.push(tds);
          });
          return out;
        })()`)) as string[][];

        // Fairness-Zeilen: [Platz, Mannschaft, Spiele, Gelb, Gelb-Rot, Rot, …, Quote].
        // Ties teilen sich den Platz → NICHT nach Position deduplizieren.
        const fairRows: (LeagueFairnessRow & { teamName: string })[] = [];
        for (const tds of fairRaw) {
          const num = (i: number) => parseInt(tds[i] ?? "0", 10) || 0;
          const quoteCell = tds[tds.length - 1] ?? "";
          fairRows.push({
            position: num(0),
            teamName: normalizeTeamName(tds[1] ?? ""),
            spiele: num(2),
            gelb: num(3),
            gelbRot: num(4),
            rot: num(5),
            quote: Number(quoteCell.replace(",", ".")) || 0
          });
        }
        fairnessTeamsInLeague = fairRows.filter((r) => r.spiele > 0).length;
        fairnessOwnRow =
          ownTokens.length > 0
            ? fairRows.find((r) => {
                const rn = r.teamName.toLowerCase();
                return ownTokens.every((t) => rn.includes(t));
              }) ?? null
            : null;
      }
    } catch {
      // Extras sind best-effort — Tabelle steht auch ohne sie.
      staffelId = staffelId ?? null;
    }

    return {
      teamsInLeague: rows.length,
      rows,
      ownRow,
      staffelId,
      topScorers,
      ownTopScorers,
      fairnessOwnRow,
      fairnessTeamsInLeague
    };
  });
}
