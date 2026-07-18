import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

/**
 * Nimmt App-Screenshots für die Social-Assets auf.
 *
 *   npm run social:capture
 *
 * Läuft gegen STAGING (kickpact.schartl.dev) und loggt sich per E2E-Bypass als
 * Demo-Nutzer ein. Voraussetzung: `scripts/seed-demo-showcase.ts` lief, es gibt
 * also eine erfundene Mannschaft mit Spielen, Sponsoren und Beiträgen.
 *
 * WARUM NICHT VON HAND SCREENSHOTTEN:
 * Die sieben Screenshots, die vorher im Repo-Root lagen, waren allesamt
 * unbrauchbar — echte Vereinsnamen (Datenschutz), tote Trigger-Typen, die es seit
 * Juli nicht mehr gibt (der Post hätte Pacts beworben, die nie feuern), ein
 * Cookie-Banner quer im Bild und ein leerer Ladezustand („0 Spiele"). Handgemachte
 * Screenshots veralten still: die App ändert sich, das Bild nicht. Hier ist die
 * Aufnahme ein Befehl, und nach jedem Redesign sind sie in zwei Minuten neu.
 *
 * KEINE ECHTEN KUNDENDATEN. Der Demo-Verein ist erfunden. In derselben DB liegen
 * echte Vereine — dieses Skript loggt sich ausschließlich als Demo-Nutzer ein und
 * ruft ausschließlich dessen Seiten auf.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://kickpact.schartl.dev";
const OUT = join(process.cwd(), "docs/marketing/screenshots");

/** Angelegt von scripts/seed-demo-showcase.ts. Alles erfunden, nichts real. */
const TEAM_PATH = "/verein/fc-beispielhausen-demo/mannschaft/demoshowcaseteam000000001";
/** Der Vereins-Admin sieht Dashboard und Spiele. */
const VEREIN_EMAIL = "demo-showcase@kickpact.example";
/** Ein Sponsor sieht den Pact-Builder — der Vereins-Admin kommt da nicht rein. */
const SPONSOR_EMAIL = "klaus.berger@kickpact.example";

/**
 * Handy-Viewport. 390×844 ist ein iPhone 14/15 in CSS-Pixeln; mit
 * deviceScaleFactor 3 kommen 1170×2532 echte Pixel raus — genug, um im
 * 1080-breiten Motiv scharf zu bleiben.
 */
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 3;

interface Shot {
  name: string;
  path: string;
  /** Als wer eingeloggt. Der Vereins-Admin kommt nicht in den Sponsor-Bereich. */
  as: string;
  /**
   * Warten, bis DIESER Text sichtbar ist. Muss eindeutig sein: „Spiele" traf 34
   * Elemente, das erste davon ein verstecktes Nav-Link, und der Shot lief in den
   * Timeout. Nimm etwas, das nur im Inhalt vorkommt.
   */
  waitFor: string;
}

const SHOTS: Shot[] = [
  {
    name: "dashboard",
    path: TEAM_PATH,
    as: VEREIN_EMAIL,
    waitFor: "Bilanz"
  },
  {
    // Das, worum es geht: alle Spiele mit Ergebnis, Saison-Filter, Bilanz.
    name: "spiele-uebersicht",
    path: `${TEAM_PATH}/spiele`,
    as: VEREIN_EMAIL,
    waitFor: "Vergangene und kommende Spiele"
  },
  {
    /*
     * Die Sponsor-Seite statt des Pact-Builders.
     * `/sponsor/pledge/new` ist nicht frei erreichbar: „Kein Einladungs-Token.
     * Bitte über den Vereins-Einladungslink kommen." Ein Sponsor kommt da nur
     * über eine echte Einladung rein — dafür müsste der Seed ein Invite-Token
     * anlegen. Das Sponsor-Dashboard zeigt ohnehin die interessantere Hälfte:
     * was beim Onkel ankommt.
     */
    name: "sponsor-dashboard",
    path: "/sponsor",
    as: SPONSOR_EMAIL,
    waitFor: "Lokale Vereine, die offen für Sponsoren sind"
  }
];

/**
 * Login per E2E-Bypass. Genau der Weg, den auch die Playwright-Tests gehen.
 * Der Guard lässt das nur durch, wenn ALLOW_TEST_AUTH und E2E_TEST_BYPASS_KEY
 * auf der Zielumgebung gesetzt sind — auf kickpact.com ist das nie der Fall.
 */
async function login(page: Page, key: string, email: string): Promise<void> {
  const res = await page.request.post(`${BASE}/api/test-auth/magic-link-stub`, {
    headers: { "x-test-bypass": key, "content-type": "application/json" },
    data: { email }
  });
  if (!res.ok()) {
    throw new Error(
      `Login fehlgeschlagen: HTTP ${res.status()}. ` +
        `404 heißt: der Guard hat abgelehnt (falscher/fehlender E2E_TEST_BYPASS_KEY, ` +
        `oder ALLOW_TEST_AUTH ist auf ${BASE} nicht gesetzt).`
    );
  }
}

/**
 * Cookie-Banner wegklicken.
 *
 * Nicht Kosmetik: auf jedem der alten Repo-Screenshots lag er quer über dem
 * Inhalt. Ein Werbebild mit Cookie-Banner sieht aus wie ein Versehen, weil es
 * eins ist.
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: /verstanden|akzeptieren/i });
  if (await button.count()) {
    await button.first().click();
    await page.waitForTimeout(400); // Ausblend-Animation
  }
}

/**
 * Die „Anstehende Aufgaben"-Checkliste einklappen.
 *
 * Sie frisst das obere Drittel des Dashboards und mahnt „Logo hinzufügen" an —
 * in einem Werbebild liest sich das, als würde die App nörgeln. Eingeklappt
 * bleibt sie ehrlich sichtbar (die Karte ist noch da), gibt aber den Blick auf
 * das frei, worum es geht: Bilanz, Tore, Sponsor-€, nächstes Spiel.
 *
 * Kein harter Fehler, wenn sie fehlt: bei 4/4 blendet die App sie selbst aus.
 */
async function collapseChecklist(page: Page): Promise<void> {
  const card = page.getByText("Anstehende Aufgaben");
  if (!(await card.count())) return;
  await card.first().click();
  await page.waitForTimeout(400);
}

async function main() {
  const key = process.env.E2E_TEST_BYPASS_KEY;
  if (!key) {
    console.error("E2E_TEST_BYPASS_KEY fehlt. Lauf über: npx dotenv -e .env.local -- npx tsx scripts/social/capture.ts");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    locale: "de-DE",
    // Reduzierte Bewegung: sonst erwischt man Einblend-Animationen auf halbem Weg.
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  let loggedInAs = "";
  for (const shot of SHOTS) {
    // Nur neu einloggen, wenn sich die Rolle ändert — der Stub legt sonst bei
    // jedem Shot eine weitere Session-Zeile an.
    if (shot.as !== loggedInAs) {
      await context.clearCookies();
      await login(page, key, shot.as);
      loggedInAs = shot.as;
    }
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    await dismissCookieBanner(page);
    await page.getByText(shot.waitFor, { exact: false }).first().waitFor({ timeout: 15_000 });
    await collapseChecklist(page);
    /*
     * Genau ein Viewport, nicht die ganze Seite.
     * Der erste Versuch war `fullPage` und kam 1170×6531 raus — im Handy-Rahmen
     * wäre das ein Strich. Ein Viewport sieht aus wie ein Handy, und das ist der
     * Punkt. (Nebenbei: `clip` mit mehr Höhe als der Viewport braucht zusätzlich
     * `fullPage`, sonst schneidet Playwright still auf den Viewport zurück.)
     */
    const buf = await page.screenshot();
    writeFileSync(join(OUT, `${shot.name}.png`), buf);
    console.log(`  ${shot.name.padEnd(24)} ${shot.path}`);
  }

  await browser.close();
  console.log(`\n${SHOTS.length} Screenshots → docs/marketing/screenshots/`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
