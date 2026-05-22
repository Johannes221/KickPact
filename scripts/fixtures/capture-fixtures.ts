// scripts/fixtures/capture-fixtures.ts
import { chromium, type Browser } from "playwright";
import fs from "fs/promises";
import path from "path";
import {
  FIXTURE_CLUBS,
  HTML_ROOT,
  JSON_ROOT,
  type FixtureClub,
} from "../../tests/fixtures/scraper/config";

const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

async function sleep(min: number, jitter = 200) {
  await new Promise((r) => setTimeout(r, min + Math.random() * jitter));
}

async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
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

async function main() {
  const clubs = ONLY
    ? FIXTURE_CLUBS.filter((c) => c.key === ONLY)
    : FIXTURE_CLUBS;
  if (clubs.length === 0) {
    console.error(`No clubs matched filter --only=${ONLY}`);
    process.exit(1);
  }
  console.log(`Capturing fixtures for ${clubs.length} club(s). force=${FORCE}`);
  await withBrowser(async (browser) => {
    for (const club of clubs) {
      console.log(`\n=== ${club.key} ===`);
      await captureClub(browser, club);
    }
  });
  console.log("\nDone. Run capture-manifest next.");
}

async function captureClub(browser: Browser, club: FixtureClub): Promise<void> {
  // Filled in next tasks (1.3 – 1.7)
  console.log(`[stub] would capture ${club.searchTerm}`);
}

// Re-export helpers for later tasks (avoid unused-warnings)
export { sleep, writeHtml, writeJson, exists };

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
