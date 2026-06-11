// scripts/fixtures/capture-fixtures.ts
import { chromium, type BrowserContext } from "playwright";
import fs from "fs/promises";
import path from "path";
import {
  FIXTURE_CLUBS,
  HTML_ROOT,
  JSON_ROOT,
  type FixtureClub,
} from "../../tests/fixtures/scraper/config";
import {
  parseAjaxTeamGamesUrl,
  parseSpielePageFileName,
  spielePageFileName,
} from "../../tests/fixtures/scraper/spiele-pages";
import {
  searchVereine,
  getMannschaften,
  getSpiele,
  getKader,
  getSpielDetails,
  setFetchHtmlObserver,
  type VereinHit,
  type MannschaftHit,
  type SpielListItem,
  type KaderPlayer,
} from "../../lib/crawler/fussballde";

const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function sleep(min: number, jitter = 200) {
  await new Promise((r) => setTimeout(r, min + Math.random() * jitter));
}

/**
 * Captcha/Sicherheitsabfrage heißt: fussball.de blockt diese IP. Weiterlaufen
 * würde nur weiter hämmern und die Sperre verlängern — sofort hart abbrechen,
 * später (andere IP / Wartezeit) erneut starten. Capture ist resumefähig
 * (alles bereits Geschriebene gilt beim nächsten Lauf als cached).
 */
function abortOnCaptcha(err: unknown): void {
  if (err instanceof Error && /Captcha/i.test(err.message)) {
    console.error(`\n!! Captcha/Block erkannt — Capture abgebrochen: ${err.message}`);
    process.exit(2);
  }
}

async function writeHtml(relPath: string, html: string): Promise<void> {
  const full = path.join(HTML_ROOT, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, html, "utf-8");
}

async function writeJson(relPath: string, data: unknown): Promise<void> {
  const full = path.join(JSON_ROOT, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data, null, 2), "utf-8");
}

async function exists(relPath: string, root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, relPath));
    return true;
  } catch {
    return false;
  }
}

async function captureSearch(
  context: BrowserContext,
  club: FixtureClub,
): Promise<VereinHit | null> {
  const htmlRel = `${club.key}/search.html`;
  const jsonRel = `${club.key}/search.json`;

  if (
    !FORCE &&
    (await exists(htmlRel, HTML_ROOT)) &&
    (await exists(jsonRel, JSON_ROOT))
  ) {
    console.log(`  search: cached`);
    const cached = JSON.parse(
      await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"),
    ) as VereinHit[];
    const cachedMatch = pickMatch(cached, club);
    if (!cachedMatch) {
      console.warn(`  ! no cached search match for ${club.searchTerm}`);
      return null;
    }
    return cachedMatch;
  }

  try {
    const page = await context.newPage();
    const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(club.searchTerm)}/restriction/-1#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    await writeHtml(htmlRel, await page.content());
    await page.close();
    await sleep(800);

    const hits = await searchVereine(club.searchTerm);
    await writeJson(jsonRel, hits);
    await sleep(800);

    const match = pickMatch(hits, club);
    if (!match) {
      console.warn(`  ! no search match for ${club.searchTerm}`);
      return null;
    }
    console.log(`  search: hit ${match.name} (id=${match.vereinId})`);
    return match;
  } catch (err) {
    abortOnCaptcha(err);
    console.warn(`  ! search failed for ${club.searchTerm}:`, (err as Error).message);
    return null;
  }
}

function pickMatch(hits: VereinHit[], club: FixtureClub): VereinHit | null {
  // Pick the most specific token from the search term (longest word with ≥4 chars,
  // ignoring short prefixes like FC/SG/SV/TSV). Falls back to first hit if nothing matches.
  const tokens = club.searchTerm
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((t) => t.length >= 4);
  const target = tokens.sort((a, b) => b.length - a.length)[0] ?? club.searchTerm.toLowerCase();
  return (
    hits.find((h) => h.name.toLowerCase().includes(target)) ??
    hits[0] ??
    null
  );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
}

/**
 * Match a configured team (e.g. "Herren 1", "A-Junioren", "Damen") against
 * the fussball.de mannschaften list. fussball.de names look like:
 *   "Herren - FC Sportfreunde 1910 Dossenheim"        → Herren 1
 *   "Herren - FC Sportfreunde 1910 Dossenheim 2"      → Herren 2
 *   "A-Junioren - JSG Dossenheim/Handschuhsheim/..."  → A-Junioren
 *   "Damen - ..."                                      → Damen
 *
 * Algorithm: parse a category + optional number from both sides and match.
 */
function matchTeam(
  mannschaften: MannschaftHit[],
  searchName: string,
): MannschaftHit | null {
  const parseConfig = (n: string): { category: string; number: number } => {
    const m = n.trim().match(/^([A-Za-zÄÖÜäöüß-]+)\s*(\d+)?$/);
    return {
      category: normalize(m?.[1] ?? n),
      number: m?.[2] ? parseInt(m[2], 10) : 1,
    };
  };
  const parseTeam = (name: string): { category: string; number: number } => {
    const dashIdx = name.indexOf(" - ");
    const head = dashIdx >= 0 ? name.slice(0, dashIdx) : name;
    const tail = dashIdx >= 0 ? name.slice(dashIdx + 3) : "";
    // A trailing number at the END of the team-string indicates 2nd/3rd/etc.
    // We deliberately match only the final token (e.g. "...Dossenheim 2") so that
    // year-numbers like "1910" in the middle of the club name are ignored.
    // Suffixes like "zg." (zweite Mannschaft Gemeinschaft) are also ignored.
    const cleaned = tail.replace(/\s*\d+\s*zg\.?\s*$/i, "").trim();
    const trailing = cleaned.match(/(\d+)\s*$/);
    return {
      category: normalize(head),
      number: trailing ? parseInt(trailing[1], 10) : 1,
    };
  };
  const target = parseConfig(searchName);
  // First pass: exact category + number
  const exact = mannschaften.find((m) => {
    const p = parseTeam(m.name);
    return p.category === target.category && p.number === target.number;
  });
  if (exact) return exact;
  // Second pass: category-contains + number
  const fuzzy = mannschaften.find((m) => {
    const p = parseTeam(m.name);
    return (
      (p.category.includes(target.category) ||
        target.category.includes(p.category)) &&
      p.number === target.number
    );
  });
  return fuzzy ?? null;
}

/** Vorhandene Pagination-HTML-Dateien eines Team/Saison-Paars (Dateinamen). */
async function listSpielePageFiles(
  clubKey: string,
  teamKey: string,
  saison: string,
): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(HTML_ROOT, clubKey));
    return files.filter((f) => {
      const p = parseSpielePageFileName(f);
      return p !== null && p.teamKey === teamKey && p.saison === saison;
    });
  } catch {
    return [];
  }
}

async function readCachedSpiele(jsonRel: string): Promise<SpielListItem[] | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"),
    ) as SpielListItem[];
  } catch {
    return null;
  }
}

/**
 * Captured Spiele-Liste UND die HTML-Seiten, aus denen sie entstand.
 *
 * getSpiele paginiert über vier AJAX-Strategien (prev/next × ohne/mit saison,
 * je mit index-Seiten) — ein einzelnes HTML pro Team/Saison kann den Lauf
 * nicht reproduzieren. Deshalb Option (a): der fetchHtml-Observer schreibt
 * JEDEN AJAX-Request des Live-Laufs als eigene Datei (Namensschema in
 * tests/fixtures/scraper/spiele-pages.ts), und das erwartete JSON wird aus
 * DEMSELBEN Lauf regeneriert. Ein Fixture-Replay (get-spiele.test.ts) fragt
 * dann deterministisch exakt dieselbe URL-Sequenz ab — nicht gecapturte
 * Seiten beantwortet der Test-Mock mit 404, was die Pagination an derselben
 * Stelle abbrechen lässt wie im Live-Lauf.
 */
async function captureSpiele(
  club: FixtureClub,
  team: MannschaftHit,
  teamKey: string,
  saison: string,
): Promise<SpielListItem[]> {
  const jsonRel = `${club.key}/${teamKey}-spiele-saison${saison}.json`;
  const cached = await readCachedSpiele(jsonRel);
  const cachedPages = await listSpielePageFiles(club.key, teamKey, saison);

  if (!FORCE && cached !== null && cachedPages.length > 0) {
    console.log(`    spiele ${teamKey} saison${saison}: cached`);
    return cached;
  }

  // HTML-Seiten des Live-Laufs einsammeln (relPath → HTML). Erst nach
  // erfolgreichem Lauf schreiben, damit ein Abbruch keinen halben Satz
  // inkonsistenter Seiten hinterlässt.
  const pages = new Map<string, string>();
  setFetchHtmlObserver((url, html) => {
    const parsed = parseAjaxTeamGamesUrl(url);
    if (!parsed || parsed.teamId !== team.teamId) return;
    pages.set(
      `${club.key}/${spielePageFileName(teamKey, saison, parsed)}`,
      html,
    );
  });

  let spiele: SpielListItem[];
  try {
    spiele = await getSpiele(team.teamId, team.slug, saison);
  } catch (err) {
    abortOnCaptcha(err);
    console.warn(
      `    ! spiele failed ${teamKey} saison${saison}:`,
      (err as Error).message,
    );
    return cached ?? [];
  } finally {
    setFetchHtmlObserver(null);
  }

  // 0 Spiele trotz vorhandener (nicht-leerer) JSON-Fixture deutet auf einen
  // stillen Block/Leer-Parse hin — gutes Fixture nicht mit Müll überschreiben.
  if (spiele.length === 0 && cached !== null && cached.length > 0) {
    console.warn(
      `    ! spiele ${teamKey} saison${saison}: Live-Lauf lieferte 0 Spiele, behalte bestehende Fixture (${cached.length})`,
    );
    return cached;
  }

  // Alte Seiten-Dateien entfernen (Seitenzahl kann schrumpfen), dann den
  // frischen, in sich konsistenten Satz schreiben: HTML-Seiten + erwartetes
  // JSON aus demselben Lauf.
  for (const stale of cachedPages) {
    await fs.unlink(path.join(HTML_ROOT, club.key, stale)).catch(() => {});
  }
  for (const [relPath, html] of pages) {
    await writeHtml(relPath, html);
  }
  await writeJson(jsonRel, spiele);
  await sleep(800);
  console.log(
    `    spiele ${teamKey} saison${saison}: ${spiele.length} (${pages.size} HTML-Seiten)`,
  );
  return spiele;
}

/** spielIds, zu denen bereits eine Detail-JSON-Fixture des Teams existiert. */
async function listExistingDetailIds(
  clubKey: string,
  teamKey: string,
): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(JSON_ROOT, clubKey));
    return files
      .filter((f) => f.startsWith(`${teamKey}-spiel-`) && f.endsWith(".json"))
      .map((f) => f.replace(`${teamKey}-spiel-`, "").replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * Captured pro Spiel die Detailseite als HTML-Fixture + das geparste JSON aus
 * demselben Lauf. Ein HTML pro Spiel reicht: nur der Detailseiten-Fetch wird
 * gemockt gebraucht; Spielerprofil- und Score-Font-Fetches haben Fallbacks
 * (siehe get-spiel-details.test.ts). Zielmenge: bestehende Detail-Fixtures des
 * Teams (damit JSONs aus früheren Captures ihr HTML-Gegenstück bekommen) plus
 * die 5 neuesten Spiele der frischen Liste.
 */
async function captureSpielDetails(
  club: FixtureClub,
  team: MannschaftHit,
  teamKey: string,
  spiele: SpielListItem[],
): Promise<void> {
  const targetIds = [
    ...new Set([
      ...(await listExistingDetailIds(club.key, teamKey)),
      ...spiele.slice(0, 5).map((s) => s.spielId),
    ]),
  ];
  for (const spielId of targetIds) {
    const jsonRel = `${club.key}/${teamKey}-spiel-${spielId}.json`;
    const htmlRel = `${club.key}/${teamKey}-spiel-${spielId}.html`;
    if (
      !FORCE &&
      (await exists(jsonRel, JSON_ROOT)) &&
      (await exists(htmlRel, HTML_ROOT))
    ) {
      console.log(`    detail ${spielId}: cached`);
      continue;
    }
    try {
      // Detailseiten-HTML aus dem Live-Lauf abgreifen; Spielerprofil-Fetches
      // desselben Laufs matchen das Muster nicht und werden ignoriert.
      const detailUrlRe = new RegExp(`/spiel/[^/]*/-/spiel/${spielId}$`);
      let detailHtml: string | null = null;
      setFetchHtmlObserver((url, html) => {
        if (detailUrlRe.test(url)) detailHtml = html;
      });
      const details = await getSpielDetails(spielId, team.slug).finally(() =>
        setFetchHtmlObserver(null),
      );
      if (detailHtml === null) {
        console.warn(`    ! detail ${spielId}: kein Detailseiten-HTML beobachtet`);
        continue;
      }

      // Drift-Hinweis: Event-Anzahl gegenüber der alten Fixture verändert
      // (fussball.de-Nachtrag/Korrektur) — JSON wird trotzdem regeneriert,
      // damit expected (JSON) und actual (Parse des HTML) konsistent sind.
      try {
        const old = JSON.parse(
          await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"),
        ) as { events?: unknown[] };
        if (
          Array.isArray(old.events) &&
          old.events.length !== details.events.length
        ) {
          console.warn(
            `    ~ detail ${spielId}: events ${old.events.length} → ${details.events.length} (Fixture regeneriert)`,
          );
        }
      } catch {
        // keine alte Fixture — nichts zu vergleichen
      }

      await writeHtml(htmlRel, detailHtml);
      await writeJson(jsonRel, details);
      await sleep(800);
      console.log(`    detail ${spielId}: ${details.events.length} events`);
    } catch (err) {
      abortOnCaptcha(err);
      console.warn(
        `    ! detail failed ${spielId}:`,
        (err as Error).message,
      );
    }
  }
}

async function captureKader(
  club: FixtureClub,
  team: MannschaftHit,
  teamKey: string,
  saison: string,
): Promise<KaderPlayer[]> {
  const jsonRel = `${club.key}/${teamKey}-kader-saison${saison}.json`;

  if (!FORCE && (await exists(jsonRel, JSON_ROOT))) {
    console.log(`    kader ${teamKey} saison${saison}: cached`);
    return JSON.parse(
      await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"),
    ) as KaderPlayer[];
  }

  try {
    const kader = await getKader(team.teamId, team.slug, saison);
    await writeJson(jsonRel, kader);
    await sleep(800);
    console.log(`    kader ${teamKey} saison${saison}: ${kader.length}`);
    return kader;
  } catch (err) {
    abortOnCaptcha(err);
    console.warn(
      `    ! kader failed ${teamKey} saison${saison}:`,
      (err as Error).message,
    );
    return [];
  }
}

async function captureMannschaften(
  context: BrowserContext,
  club: FixtureClub,
  verein: VereinHit,
): Promise<MannschaftHit[]> {
  const htmlRel = `${club.key}/mannschaften.html`;
  const jsonRel = `${club.key}/mannschaften.json`;

  if (!FORCE && (await exists(jsonRel, JSON_ROOT))) {
    console.log(`  mannschaften: cached`);
    return JSON.parse(
      await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"),
    ) as MannschaftHit[];
  }

  try {
    const page = await context.newPage();
    const url = `https://www.fussball.de/verein/${verein.slug}/-/id/${verein.vereinId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    await writeHtml(htmlRel, await page.content());
    await page.close();
    await sleep(800);

    const mannschaften = await getMannschaften(verein.vereinId, verein.slug, verein.name);
    await writeJson(jsonRel, mannschaften);
    await sleep(800);

    console.log(`  mannschaften: ${mannschaften.length} found`);
    return mannschaften;
  } catch (err) {
    abortOnCaptcha(err);
    console.warn(`  ! mannschaften failed for ${club.key}:`, (err as Error).message);
    return [];
  }
}

async function captureClub(club: FixtureClub): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const verein = await captureSearch(context, club);
    if (!verein) {
      console.warn(`  skipping ${club.key} — no verein found`);
      return;
    }
    const mannschaften = await captureMannschaften(context, club, verein);
    if (mannschaften.length === 0) return;

    for (const teamCfg of club.teams) {
      const team = matchTeam(mannschaften, teamCfg.searchName);
      if (!team) {
        console.warn(`  ! team not found: ${teamCfg.searchName} — skipping`);
        continue;
      }
      console.log(`  team: ${team.name} (id=${team.teamId})`);
      for (const saison of teamCfg.saisons) {
        const spiele = await captureSpiele(club, team, teamCfg.key, saison);
        await captureKader(club, team, teamCfg.key, saison);
        await captureSpielDetails(club, team, teamCfg.key, spiele);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const clubs = ONLY
    ? FIXTURE_CLUBS.filter((c) => c.key === ONLY)
    : FIXTURE_CLUBS;
  if (clubs.length === 0) {
    console.error(`No clubs matched filter --only=${ONLY}`);
    process.exit(1);
  }
  console.log(`Capturing fixtures for ${clubs.length} club(s). force=${FORCE}`);
  for (const club of clubs) {
    console.log(`\n=== ${club.key} ===`);
    try {
      await captureClub(club);
    } catch (err) {
      console.error(`  ! captureClub failed for ${club.key}:`, (err as Error).message);
    }
  }
  console.log("\nDone. Run capture-manifest next.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
