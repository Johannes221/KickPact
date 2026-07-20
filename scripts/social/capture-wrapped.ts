import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/**
 * Holt die ECHTEN Wrapped-Share-Vorlagen des Demo-Vereins als Bilder — dieselben
 * 9:16-Karten, die ein Verein aus der App teilt (Route
 * `/api/teams/[teamId]/wrapped-image/[slide]`). Die zeigen wir im Reel im
 * iPhone-Rahmen: „so sieht dein Rückblick echt aus".
 *
 * Auth wie capture.ts (E2E-Bypass, nur auf Staging aktiv). Die Route ist
 * auth-gated und braucht WRAPPED_MIN_MATCHES Spiele — der Demo-Seed liefert die.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/social/capture-wrapped.ts
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://kickpact.schartl.dev";
const TEAM = "demoshowcaseteam000000001";
const EMAIL = "demo-showcase@kickpact.example";
const OUT = join(process.cwd(), "public/brand/wrapped");

/** Die visuell stärksten Slides für die Vorschau. */
const SLIDES = ["intro", "bilanz", "tabellenplatz", "tore", "torschuetze", "zusammenfassung"];

async function main() {
  const key = process.env.E2E_TEST_BYPASS_KEY;
  if (!key) {
    console.error("E2E_TEST_BYPASS_KEY fehlt. Über: npx dotenv -e .env.local -- npx tsx scripts/social/capture-wrapped.ts");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "de-DE" });
  const page = await ctx.newPage();

  const login = await page.request.post(`${BASE}/api/test-auth/magic-link-stub`, {
    headers: { "x-test-bypass": key, "content-type": "application/json" },
    data: { email: EMAIL }
  });
  if (!login.ok()) throw new Error(`Login fehlgeschlagen: HTTP ${login.status()}`);

  let ok = 0;
  for (const slide of SLIDES) {
    const r = await page.request.get(`${BASE}/api/teams/${TEAM}/wrapped-image/${slide}`);
    const type = r.headers()["content-type"] ?? "";
    if (r.ok() && type.includes("image")) {
      writeFileSync(join(OUT, `${slide}.png`), await r.body());
      console.log(`  ✓ ${slide}`);
      ok++;
    } else {
      console.log(`  ✗ ${slide} → HTTP ${r.status()} (${type})`);
    }
  }

  await browser.close();
  console.log(`\n${ok}/${SLIDES.length} Wrapped-Vorlagen → public/brand/wrapped/`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
