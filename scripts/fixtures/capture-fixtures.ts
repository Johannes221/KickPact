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
  searchVereine,
  type VereinHit,
} from "../../lib/crawler/fussballde";

const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function sleep(min: number, jitter = 200) {
  await new Promise((r) => setTimeout(r, min + Math.random() * jitter));
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

async function captureClub(club: FixtureClub): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const verein = await captureSearch(context, club);
    if (!verein) {
      console.warn(`  skipping ${club.key} — no verein found`);
      return;
    }
    // Mannschaften + Teams kommen in Tasks 1.4 – 1.7
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
