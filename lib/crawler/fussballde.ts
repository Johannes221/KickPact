import { createHash } from "node:crypto";
import { chromium, type Page } from "playwright";

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

/** Shared JS that extracts match rows from fussball.de table HTML */
const EXTRACT_MATCHES_JS = `(function() {
  var results = [];
  var seen = new Set();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var allTrs = Array.from(document.querySelectorAll("tr"));
  var currentDatum = "";
  allTrs.forEach(function(tr) {
    if (tr.classList.contains("row-headline") || tr.classList.contains("row-competition")) {
      var txt = (tr.textContent || "").replace(/\\s+/g, " ").trim();
      var dm = txt.match(/(\\d{2}\\.\\d{2}\\.\\d{4})/);
      var dm2 = txt.match(/(\\d{2}\\.\\d{2}\\.\\d{2})(?!\\d)/);
      if (dm) currentDatum = dm[1];
      else if (dm2) currentDatum = dm2[1];
      return;
    }

    var link = tr.querySelector('a[href*="/spiel/"]');
    if (!link) return;
    var href = link.href || "";
    var m = href.match(/\\/spiel\\/([^/]+)\\/-\\/spiel\\/([A-Z0-9]+)/);
    if (!m || seen.has(m[2])) return;
    if (!currentDatum) return;

    var parts = currentDatum.split(".");
    if (parts.length !== 3) return;
    var yr = parts[2].length === 2 ? "20" + parts[2] : parts[2];
    var matchDate = new Date(yr + "-" + parts[1] + "-" + parts[0]);
    if (!matchDate || matchDate >= today) return;
    seen.add(m[2]);

    var tds = Array.from(tr.querySelectorAll("td")).map(function(td) {
      return (td.textContent || "").replace(/\\s+/g, " ").trim();
    });
    var teamTds = tds.filter(function(t) { return t && t !== ":" && t !== "Zum Spiel" && t !== "Nichtantritt GAST" && t !== "Nichtantritt HEIM"; });

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
})()`;

export async function getSpiele(
  teamId: string,
  slug: string,
  saison: string
): Promise<SpielListItem[]> {
  return withPage(async (page) => {
    const allResults = new Map<string, SpielListItem>();

    // Strategy 1a: paginate through ajax.team.prev.games (returns current half-season)
    // fussball.de returns ~10 matches per page; try up to 8 pages (≈80 matches, full season)
    const MAX_PAGES = 8;
    for (let idx = 0; idx < MAX_PAGES; idx++) {
      const ajaxUrl = idx === 0
        ? `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`
        : `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}/index/${idx}`;
      try {
        await page.goto(ajaxUrl, { waitUntil: "networkidle", timeout: 20000 });
        await assertNotCaptcha(page);
        await page.waitForTimeout(800);
        const pageResults = await page.evaluate(EXTRACT_MATCHES_JS) as SpielListItem[];
        if (pageResults.length === 0) break; // no more data
        let newCount = 0;
        for (const r of pageResults) {
          if (!allResults.has(r.spielId)) {
            allResults.set(r.spielId, r);
            newCount++;
          }
        }
        if (newCount === 0) break; // all duplicates → we've exhausted pages
      } catch (err) {
        // Captcha errors are loud signals — rethrow so the whole crawl fails.
        if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
        break;
      }
    }

    // Strategy 1b: saison-specific AJAX — explicitly requests the full season including Hinrunde
    // fussball.de sometimes gates Hinrunde behind a saison parameter
    for (let idx = 0; idx < MAX_PAGES; idx++) {
      const ajaxUrl = idx === 0
        ? `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}/saison/${saison}`
        : `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}/saison/${saison}/index/${idx}`;
      try {
        await page.goto(ajaxUrl, { waitUntil: "networkidle", timeout: 20000 });
        await assertNotCaptcha(page);
        await page.waitForTimeout(800);
        const pageResults = await page.evaluate(EXTRACT_MATCHES_JS) as SpielListItem[];
        if (pageResults.length === 0) break;
        let newCount = 0;
        for (const r of pageResults) {
          if (!allResults.has(r.spielId)) {
            allResults.set(r.spielId, r);
            newCount++;
          }
        }
        if (newCount === 0) break;
      } catch (err) {
        // Captcha errors are loud signals — rethrow so the whole crawl fails.
        if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
        break;
      }
    }

    // Strategy 2: main team page Spielplan — shows both halves; also click Hinrunde tab
    // fussball.de defaults to Rückrunde tab; we click Hinrunde to capture first-half games
    try {
      const mainUrl = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
      await page.goto(mainUrl, { waitUntil: "networkidle", timeout: 30000 });
      await assertNotCaptcha(page);
      await page.waitForTimeout(2000);

      // Extract whatever is currently visible (usually Rückrunde)
      const mainResults = await page.evaluate(EXTRACT_MATCHES_JS) as SpielListItem[];
      for (const r of mainResults) {
        if (!allResults.has(r.spielId)) allResults.set(r.spielId, r);
      }

      // Click Hinrunde / Vorrunde tab to capture first-half games
      const tabClicked = await page.evaluate(`(function() {
        var els = Array.from(document.querySelectorAll('a, button, span, li'));
        var tab = els.find(function(el) {
          var t = (el.textContent || '').toLowerCase().replace(/\\s+/g, '').trim();
          return t === 'hinrunde' || t === 'vorrunde' || t === 'hinserie';
        });
        if (tab) { tab.click(); return true; }
        return false;
      })()`) as boolean;

      if (tabClicked) {
        await page.waitForTimeout(2000);
        const hinrundeResults = await page.evaluate(EXTRACT_MATCHES_JS) as SpielListItem[];
        for (const r of hinrundeResults) {
          if (!allResults.has(r.spielId)) allResults.set(r.spielId, r);
        }
      }
    } catch (err) {
      // Captcha errors are loud signals — rethrow so the whole crawl fails.
      if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
      // ignore other errors (network hiccup on Strategy 2 is OK — we already
      // have data from Strategy 1)
    }

    const raw = Array.from(allResults.values());
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

const playerNameCache = new Map<string, string>();

function extractPlayerIdFromUrl(url: string): string | null {
  const m = url.match(/\/(?:player-id|userid)\/([A-Z0-9]+)/i);
  return m ? m[1] : null;
}

async function resolvePlayerName(page: Page, playerUrl: string): Promise<string> {
  const id = extractPlayerIdFromUrl(playerUrl);
  if (!id) return playerUrl;
  if (playerNameCache.has(id)) return playerNameCache.get(id)!;

  try {
    await page.goto(playerUrl, { waitUntil: "networkidle", timeout: 20000 });
    await assertNotCaptcha(page);
    await page.waitForTimeout(1000);
    const name = await page.evaluate(`(function() {
      var title = document.title;
      var m = title.match(/^(.+?)\\s*(?:Basisprofil|Profil|\\|)/i);
      if (m) return m[1].trim();
      return title.split("|")[0].trim();
    })()`) as string
    playerNameCache.set(id, name || id);
    return playerNameCache.get(id)!;
  } catch (err) {
    // Captcha errors are loud signals — rethrow so the whole crawl fails.
    if (err instanceof Error && /Captcha/i.test(err.message)) throw err;
    playerNameCache.set(id, id);
    return id;
  }
}

export async function getSpielDetails(
  spielId: string,
  slug: string
): Promise<SpielDetails> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/spiel/${slug || "spiel"}/-/spiel/${spielId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await assertNotCaptcha(page);
    await page.waitForTimeout(3000);

    const raw = await page.evaluate(`(function() {
      var result = {
        heim: "",
        gast: "",
        ergebnisHeim: 0,
        ergebnisGast: 0,
        halbzeitHeim: null,
        halbzeitGast: null,
        rawEvents: [],
        spielerUrls: []
      };

      var heimEl = document.querySelector(".team-home .team-name");
      result.heim = heimEl ? (heimEl.textContent || "").replace(/\\s+/g, " ").trim() : "";
      var gastEl = document.querySelector(".team-away .team-name");
      result.gast = gastEl ? (gastEl.textContent || "").replace(/\\s+/g, " ").trim() : "";

      var matchCourse = document.querySelector(".match-course");
      var rowEvents = matchCourse ? Array.from(matchCourse.querySelectorAll(".row-event")) : [];
      rowEvents.forEach(function(row) {
        var isRight = row.classList.contains("event-right");
        var isLeft = row.classList.contains("event-left");
        var valignEl = row.querySelector(".valign-inner");
        var minuteText = valignEl ? (valignEl.textContent || "").replace(/\\s+/g, "").replace("'", "").trim() : null;
        var isGoal = row.querySelector(".hexagon.green") !== null;
        var isSubstitute = row.querySelector(".icon-substitute") !== null;
        var playerLinks = Array.from(row.querySelectorAll('a[href*="spielerprofil"]'))
          .map(function(a) { return a.href; })
          .filter(function(h) { return h.includes("/player-id/") || h.includes("/userid/"); });

        var side = isRight ? "gast" : isLeft ? "heim" : "unbekannt";
        var minute = minuteText ? parseInt(minuteText, 10) : null;

        if ((isGoal || isSubstitute) && playerLinks.length > 0) {
          result.rawEvents.push({ typ: isGoal ? "TOR" : "AUSWECHSLUNG", minute: minute, side: side, playerLinks: playerLinks });
          playerLinks.forEach(function(u) {
            if (!result.spielerUrls.includes(u)) result.spielerUrls.push(u);
          });
        }
      });

      var goals = result.rawEvents.filter(function(e) { return e.typ === "TOR"; });
      result.ergebnisHeim = goals.filter(function(g) { return g.side === "heim"; }).length;
      result.ergebnisGast = goals.filter(function(g) { return g.side === "gast"; }).length;

      var firstHalfGoals = goals.filter(function(g) { return g.minute !== null && g.minute <= 45; });
      result.halbzeitHeim = firstHalfGoals.filter(function(g) { return g.side === "heim"; }).length;
      result.halbzeitGast = firstHalfGoals.filter(function(g) { return g.side === "gast"; }).length;

      return result;
    })()`) as { heim: string; gast: string; ergebnisHeim: number; ergebnisGast: number; halbzeitHeim: number | null; halbzeitGast: number | null; rawEvents: Array<{typ: string; minute: number | null; side: "heim" | "gast" | "unbekannt"; playerLinks: string[]}>; spielerUrls: string[] }

    // Resolve player names sequentially (cached)
    for (const u of raw.spielerUrls) {
      const id = extractPlayerIdFromUrl(u);
      if (!id || playerNameCache.has(id)) continue;
      await page.waitForTimeout(800);
      await resolvePlayerName(page, u);
    }

    // Build typed events
    const events: ScrapedEvent[] = raw.rawEvents.map((ev) => {
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
      return { typ: ev.typ as "TOR" | "AUSWECHSLUNG", minute: ev.minute, side: ev.side };
    });

    events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

    return {
      spielId,
      heim: raw.heim,
      gast: raw.gast,
      ergebnis: { heim: raw.ergebnisHeim, gast: raw.ergebnisGast },
      halbzeit:
        raw.halbzeitHeim !== null && raw.halbzeitGast !== null
          ? { heim: raw.halbzeitHeim, gast: raw.halbzeitGast }
          : null,
      events
    };
  });
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
