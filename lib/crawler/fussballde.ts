import { createHash } from "node:crypto";
import { chromium, type Page } from "playwright";
import { fetch as undiciFetch } from "undici";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { saisonStartDate } from "@/lib/utils/saison";

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
      if (
        html.length < 3000 &&
        /g-recaptcha|datadome|captcha-delivery|zugriff verweigert|access denied/i.test(
          html
        )
      ) {
        throw new Error("Captcha/Block-Seite erkannt");
      }
      return parseHtml(html);
    },
    { maxAttempts: 3, baseDelayMs: 800 }
  );
}

/** Normalisiert Whitespace eines Parser-Nodes (analog textContent.trim()). */
function nodeText(el: { text?: string } | null | undefined): string {
  return (el?.text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Extrahiert die Liga/Spielklasse aus dem Text einer `row-competition`-Zeile.
 * fussball.de schreibt dort z.B. "Kreisliga A, Staffel 3, Herren" — uns
 * interessiert nur der erste Teil vor dem Komma (die eigentliche Spielklasse).
 * Gibt `null` zurück, wenn nichts Sinnvolles übrig bleibt.
 */
export function extractLeagueFromCompetitionText(raw: string): string | null {
  const league = (raw ?? "").split(",")[0].trim();
  return league.length > 0 ? league : null;
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
  return withPage(async (page) => {
    const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(suchbegriff)}/restriction/-1#!/`;
    // Vorher: waitUntil="networkidle" — fußball.de hat Long-Polling-Tracker,
    // dadurch triggered networkidle teils nie und wartet den vollen 30s-
    // Timeout. domcontentloaded + waitForSelector auf das tatsächliche
    // Ergebnis-Element ist deterministisch: sobald Verein-Links im DOM
    // sind, geht's weiter. Typisch ~2-4s statt 20-30s.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await assertNotCaptcha(page);
    await page
      .waitForSelector('a[href*="/verein/"]', { timeout: 8000 })
      .catch(() => {
        // Kein Treffer → returnen wir gleich leeres Array, nicht 8s warten
        // und dann doch leer. evaluate unten liefert dann [] zurück.
      });

    return await page.evaluate(`(function() {
      var results = [];
      var seen = new Set();
      document.querySelectorAll('a[href*="/verein/"]').forEach(function(link) {
        var href = link.href || link.getAttribute("href") || "";
        var m = href.match(/\\/verein\\/([^/]+)\\/-\\/id\\/([A-Z0-9]+)/);
        if (!m || seen.has(m[2])) return;
        seen.add(m[2]);
        var raw = (link.textContent || "").replace(/\\s+/g, " ").trim();
        // Address-Pattern "<Name> <5-stellige PLZ> <Ort>" abspalten, falls vorhanden
        var addr = raw.match(/^(.+?)\\s+\\d{5}\\s+(.+)$/);
        var name, ort;
        if (addr) { name = addr[1].trim(); ort = addr[2].trim(); }
        else { name = raw || m[1]; ort = null; }
        results.push({ name: name, ort: ort, slug: m[1], vereinId: m[2], url: href });
      });
      return results;
    })()`) as VereinHit[];
  });
}

/**
 * Leitet die aktuelle Saison aus dem Systemdatum ab.
 * Deutsche Amateur-Saisons laufen Aug → Jun:
 *   Mai 2026 → Saison 25/26 → "2526"
 *   Sep 2026 → Saison 26/27 → "2627"
 */
function currentSaisonCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const startYear = month >= 7 ? year : year - 1;
  return String(startYear).slice(-2) + String(startYear + 1).slice(-2);
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
  return withPage(async (page) => {
    // ─── Strategie A: Verein-Hauptseite, Sektion "Mannschaften des Vereins" ──
    // fussball.de rendert auf der Vereinsseite einen <div class="club-teams">
    // Block der ausschließlich die eigenen Mannschaften enthält (inkl. JSG/SpG-
    // Teams die dem Verein zugeordnet sind). Alle Mannschaftslinks außerhalb
    // dieses Blocks sind entweder Navigation oder Gegner-Links aus dem
    // Spielplan-Widget — die werden hier bewusst ignoriert.
    let strategyAResults: MannschaftHit[] = [];
    try {
      const vereinUrl = `https://www.fussball.de/verein/${slug}/-/id/${vereinId}#!/`;
      await page.goto(vereinUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      await assertNotCaptcha(page);
      await page
        .waitForSelector('div.club-teams a[href*="/mannschaft/"]', { timeout: 10000 })
        .catch(() => {});

      strategyAResults = (await page.evaluate(`(function() {
        var results = [];
        var seen = new Set();
        // Nur Links innerhalb der "Mannschaften des Vereins"-Sektion
        document.querySelectorAll('div.club-teams a[href*="/mannschaft/"]').forEach(function(link) {
          var href = link.href || link.getAttribute("href") || "";
          var m = href.match(/\\/mannschaft\\/([^/]+)\\/-\\/saison\\/(\\d{4})\\/team-id\\/([A-Z0-9]{20,})/);
          if (!m) return;
          var teamId = m[3];
          if (seen.has(teamId)) return;
          seen.add(teamId);
          var name = (link.textContent || '').replace(/\\s+/g, ' ').trim() || m[1];
          results.push({ name: name, slug: m[1], saison: m[2], teamId: teamId, url: href });
        });
        return results;
      })()`)) as MannschaftHit[];
    } catch (err) {
      if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
      // Strategie A gescheitert — Fallback auf B
    }

    // ─── Strategie B: ajax.club.matchplan (Fallback) ──────────────────────────
    // Nur ausgeführt wenn Strategie A 0 Ergebnisse liefert.
    // ACHTUNG: Dieser Endpoint liefert ALLE Teams aller Ligen in denen der Verein
    // spielt (inkl. Gegner), nicht nur eigene Mannschaften. Deshalb ist der
    // vereinName-AND-Filter hier zwingend.
    let strategyBResults: MannschaftHit[] = [];
    if (strategyAResults.length === 0) {
      try {
        const matchplanUrl = `https://www.fussball.de/ajax.club.matchplan/-/id/${vereinId}/mode/PAGE/show-filter/true`;
        await page.goto(matchplanUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await assertNotCaptcha(page);

        const saison = currentSaisonCode();
        strategyBResults = (await page.evaluate(`(function(saison) {
          var results = [];
          var seen = new Set();
          document.querySelectorAll('select option[value]').forEach(function(opt) {
            var teamId = opt.getAttribute('value');
            if (!teamId || teamId.length < 20 || !/^[A-Z0-9]+$/.test(teamId)) return;
            if (seen.has(teamId)) return;
            seen.add(teamId);
            var name = (opt.textContent || '').replace(/\\s+/g, ' ').trim();
            results.push({ name: name, slug: '', saison: saison, teamId: teamId, url: '' });
          });
          return results;
        })(${JSON.stringify(saison)})`)) as MannschaftHit[];

        strategyBResults = strategyBResults.map((t) => ({
          ...t,
          slug: slugifyTeamName(t.name),
          url: `https://www.fussball.de/mannschaft/${slugifyTeamName(t.name)}/-/saison/${t.saison}/team-id/${t.teamId}`,
        }));
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
    // AND-Logik: alle signifikanten Tokens müssen im Teamnamen vorkommen,
    // um False-Positives aus dem Matchplan-Widget zu vermeiden.
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
    const base = `https://www.fussball.de/ajax.team.${kind}.games/-/mode/PAGE/team-id/${teamId}`;
    const saisonSeg = saison ? `/saison/${saison}` : "";
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

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  const url = `https://www.fussball.de/spiel/${slug || "spiel"}/-/spiel/${spielId}`;
  const root = await fetchHtml(url);

  const heim = nodeText(root.querySelector(".team-home .team-name"));
  const gast = nodeText(root.querySelector(".team-away .team-name"));

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
  const ergebnisHeim = goals.filter((g) => g.side === "heim").length;
  const ergebnisGast = goals.filter((g) => g.side === "gast").length;
  const firstHalfGoals = goals.filter(
    (g) => g.minute !== null && g.minute <= 45
  );
  const halbzeitHeim = firstHalfGoals.filter((g) => g.side === "heim").length;
  const halbzeitGast = firstHalfGoals.filter((g) => g.side === "gast").length;

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
    ergebnis: { heim: ergebnisHeim, gast: ergebnisGast },
    // Halbzeit-Stand aus den Tor-Events (Minute ≤ 45). Wie zuvor immer als
    // Objekt (auch 0:0) — NICHT null, sonst ändert sich der content-hash aller
    // bestehenden Matches und löst unnötige Re-Evaluation aus.
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
  slug: string,
  saison: string
): Promise<KaderPlayer[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await assertNotCaptcha(page);
    await page.waitForTimeout(2000);

    return await page.evaluate(`(function() {
      var players = [];
      var seen = new Set();

      // Strategy 1: kader table rows with player profile links
      document.querySelectorAll('a[href*="spielerprofil"]').forEach(function(link) {
        var href = link.href || link.getAttribute("href") || "";
        var idMatch = href.match(/\\/(?:player-id|userid)\\/([A-Z0-9]+)/i);
        var id = idMatch ? idMatch[1] : null;
        if (id && seen.has(id)) return;
        var name = (link.textContent || "").replace(/\\s+/g, " ").trim();
        if (name.length < 2) return;
        if (id) seen.add(id);
        players.push({ name: name, spielerId: id || undefined });
      });

      // Strategy 2: .column-name cells in kader tables (fallback if links have no text)
      if (players.length === 0) {
        document.querySelectorAll('.column-name').forEach(function(cell) {
          var name = (cell.textContent || "").replace(/\\s+/g, " ").trim();
          if (name.length > 1 && !seen.has(name)) {
            seen.add(name);
            players.push({ name: name });
          }
        });
      }

      return players;
    })()`) as KaderPlayer[];
  });
}
