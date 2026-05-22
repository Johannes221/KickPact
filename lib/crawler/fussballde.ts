import { chromium, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface VereinHit {
  name: string;
  ort: string | null;
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

export async function getMannschaften(
  vereinId: string,
  slug: string,
  vereinName?: string
): Promise<MannschaftHit[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/verein/${slug}/-/id/${vereinId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const raw = (await page.evaluate(`(function() {
      var results = [];
      var seen = new Set();
      document.querySelectorAll('a[href*="/mannschaft/"]').forEach(function(link) {
        var href = link.href || link.getAttribute("href") || "";
        var m = href.match(/\\/mannschaft\\/([^/]+)\\/-\\/saison\\/(\\d+)\\/team-id\\/([A-Z0-9]+)/);
        if (m && !seen.has(m[3])) {
          seen.add(m[3]);
          var name = (link.textContent || "").replace(/\\s+/g, " ").trim() || m[1];
          results.push({ name: name, slug: m[1], saison: m[2], teamId: m[3], url: href });
        }
      });
      return results;
    })()`)) as MannschaftHit[];

    if (!vereinName) return raw;

    // Filter heuristik: nur Mannschaften behalten, deren Name mindestens einen
    // signifikanten Token (≥3 Zeichen, nicht rein numerisch) aus dem Vereinsnamen
    // enthält. Verhindert Cross-Contamination durch Gegner-Links aus dem Spielplan-Widget.
    const tokens = vereinName
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
    if (tokens.length === 0) return raw;

    return raw.filter((team) => {
      const tLower = team.name.toLowerCase();
      return tokens.some((tok) => tLower.includes(tok));
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
      } catch {
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
      } catch {
        break;
      }
    }

    // Strategy 2: main team page Spielplan — shows both halves; also click Hinrunde tab
    // fussball.de defaults to Rückrunde tab; we click Hinrunde to capture first-half games
    try {
      const mainUrl = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
      await page.goto(mainUrl, { waitUntil: "networkidle", timeout: 30000 });
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
    } catch {
      // ignore
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
    await page.waitForTimeout(1000);
    const name = await page.evaluate(`(function() {
      var title = document.title;
      var m = title.match(/^(.+?)\\s*(?:Basisprofil|Profil|\\|)/i);
      if (m) return m[1].trim();
      return title.split("|")[0].trim();
    })()`) as string
    playerNameCache.set(id, name || id);
    return playerNameCache.get(id)!;
  } catch {
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
