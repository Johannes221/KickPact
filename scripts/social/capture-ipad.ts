import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

/**
 * iPad-13"-Screenshots (2064×2752) für die App-Store-Einreichung — dieselben
 * Screens wie capture.ts, nur im iPad-Viewport. Login per E2E-Bypass gegen
 * Staging mit dem Demo-Verein.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/social/capture-ipad.ts
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://kickpact.schartl.dev";
const OUT = join(process.cwd(), "out/appstore/ipad");
// iPad Pro 13" = 1032×1376 pt @2x → 2064×2752 px (Apples geforderte Größe).
const VIEWPORT = { width: 1032, height: 1376 };
const SCALE = 2;

const TEAM = "/verein/fc-beispielhausen-demo/mannschaft/demoshowcaseteam000000001";
const VEREIN = "demo-showcase@kickpact.example";
const SPONSOR = "klaus.berger@kickpact.example";

const SHOTS = [
  { name: "1-dashboard", path: TEAM, as: VEREIN, waitFor: "Bilanz" },
  { name: "2-spiele", path: `${TEAM}/spiele`, as: VEREIN, waitFor: "Vergangene und kommende Spiele" },
  { name: "3-sponsoren", path: `${TEAM}/sponsoren`, as: VEREIN, waitFor: "Sponsor" },
  { name: "4-sponsor", path: "/sponsor", as: SPONSOR, waitFor: "Lokale Vereine" }
];

async function login(page: Page, key: string, email: string): Promise<void> {
  const res = await page.request.post(`${BASE}/api/test-auth/magic-link-stub`, {
    headers: { "x-test-bypass": key, "content-type": "application/json" },
    data: { email }
  });
  if (!res.ok()) throw new Error(`Login fehlgeschlagen: HTTP ${res.status()}`);
}

async function main() {
  const key = process.env.E2E_TEST_BYPASS_KEY;
  if (!key) {
    console.error("E2E_TEST_BYPASS_KEY fehlt.");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    locale: "de-DE",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  let loggedIn = "";
  for (const shot of SHOTS) {
    if (shot.as !== loggedIn) {
      await context.clearCookies();
      await login(page, key, shot.as);
      loggedIn = shot.as;
    }
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    const cookie = page.getByRole("button", { name: /verstanden|akzeptieren/i });
    if (await cookie.count()) await cookie.first().click();
    try {
      await page.getByText(shot.waitFor, { exact: false }).first().waitFor({ timeout: 12_000 });
    } catch {
      // best-effort — Screenshot trotzdem
    }
    await page.waitForTimeout(600);
    const buf = await page.screenshot();
    writeFileSync(join(OUT, `${shot.name}.png`), buf);
    console.log(`  ${shot.name.padEnd(14)} ${shot.path}`);
  }

  await browser.close();
  console.log(`\n${SHOTS.length} iPad-Screenshots (2064×2752) → out/appstore/ipad/`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
