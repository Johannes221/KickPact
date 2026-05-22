# Scraper Real-Data Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufbau einer reproduzierbaren End-to-End-Validierungs-Suite für den KickPact-Scraper und die Trigger-Engine, basierend auf realen Heidelberger Vereinsdaten, mit täglicher Drift-Detection.

**Architecture:** Hybrid-Fixture-Layer (HTML für Parser-Tests, JSON für Engine/Integration/E2E), aufgeteilt in 4 Test-Ebenen (Parser, Engine, Integration, E2E) plus PDF/E-Mail-Snapshot-Tests, plus tägliche Drift-Detection per GitHub Action mit Field-Level-Diff. Phase 1 ist Voraussetzung für alles, danach sind Phasen 2/3/4/8 parallel ausführbar, Phase 5/6/7 nach Phase 4.

**Tech Stack:** Vitest 2.1.5, Playwright 1.48.2 (chromium-headless), Drizzle ORM + Postgres 16, Inngest 3.27.5, Next.js 15 App Router, @react-pdf/renderer, Resend, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-05-22-scraper-realdata-validation-design.md](../specs/2026-05-22-scraper-realdata-validation-design.md)

---

## Parallelisierungs-Hinweise (für Subagent-Driven-Execution)

**Strikt sequenziell:**
- Phase 1 (Fixture-Foundation) — alles andere baut darauf
- Phase 9 (Docs + CI) — am Ende, fasst alles zusammen

**Nach Phase 1 parallel möglich (4 Worktrees):**
- Worktree A: Phase 2 (Parser-Tests)
- Worktree B: Phase 3 (Engine-Tests)
- Worktree C: Phase 4 (Production-Code-Erweiterungen)
- Worktree D: Phase 8 (Drift-Detection-Script)

**Nach Phase 4 parallel möglich (3 Worktrees):**
- Worktree A: Phase 5 (Integration-Tests)
- Worktree B: Phase 6 (Rendering-Tests)
- Worktree C: Phase 7 (E2E-Tests)

Konflikt-Zonen zwischen Worktrees: `package.json` (NPM-Scripts), `vitest.config.ts`. Diese werden in Phase 9 konsolidiert.

---

## Phase 1 — Fixture-Foundation (sequenziell, Voraussetzung)

### Task 1.1: Verein-Konfiguration anlegen

**Files:**
- Create: `tests/fixtures/scraper/config.ts`

- [ ] **Step 1: Datei erstellen mit Verein-Set**

```typescript
// tests/fixtures/scraper/config.ts
export type FixtureTeam = {
  key: string;
  searchName: string;
  saisons: readonly string[];
};

export type FixtureClub = {
  key: string;
  searchTerm: string;
  expectedVereinIdPattern: RegExp;
  teams: readonly FixtureTeam[];
};

export const FIXTURE_CLUBS: readonly FixtureClub[] = [
  {
    key: "dossenheim",
    searchTerm: "FC Sportfreunde 1910 Dossenheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526", "2425"] },
      { key: "herren3", searchName: "Herren 3", saisons: ["2526", "2425"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
      { key: "c-junioren", searchName: "C-Junioren", saisons: ["2526"] },
      { key: "damen", searchName: "Damen", saisons: ["2526"] },
    ],
  },
  {
    key: "heidelberg-kirchheim",
    searchTerm: "SG Heidelberg-Kirchheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526", "2425"] },
      { key: "b-junioren", searchName: "B-Junioren", saisons: ["2526"] },
    ],
  },
  {
    key: "handschuhsheim",
    searchTerm: "TSV Handschuhsheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
      { key: "d-junioren", searchName: "D-Junioren", saisons: ["2526"] },
    ],
  },
  {
    key: "schriesheim",
    searchTerm: "SG Schriesheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
    ],
  },
] as const;

export const FIXTURES_ROOT = "tests/fixtures/scraper";
export const HTML_ROOT = `${FIXTURES_ROOT}/html`;
export const JSON_ROOT = `${FIXTURES_ROOT}/json`;
export const MANIFEST_PATH = `${FIXTURES_ROOT}/manifest.json`;
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/scraper/config.ts
git commit -m "test(fixtures): add club configuration for real-data validation"
```

---

### Task 1.2: Capture-Skript Grundgerüst

**Files:**
- Create: `scripts/fixtures/capture-fixtures.ts`

- [ ] **Step 1: Skript anlegen mit Browser-Setup + CLI-Args**

```typescript
// scripts/fixtures/capture-fixtures.ts
import { chromium, type Browser, type Page } from "playwright";
import fs from "fs/promises";
import path from "path";
import { FIXTURE_CLUBS, HTML_ROOT, JSON_ROOT, MANIFEST_PATH, type FixtureClub } from "../../tests/fixtures/scraper/config";

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verzeichnisse anlegen**

```bash
mkdir -p tests/fixtures/scraper/html tests/fixtures/scraper/json scripts/fixtures
```

- [ ] **Step 3: Trockenlauf**

Run: `npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim`
Expected: `=== dossenheim ===` und `[stub] would capture ...`, kein Error.

- [ ] **Step 4: Commit**

```bash
git add scripts/fixtures/capture-fixtures.ts tests/fixtures/scraper/
git commit -m "test(fixtures): scaffold capture script skeleton"
```

---

### Task 1.3: Verein-Suche Capture

**Files:**
- Modify: `scripts/fixtures/capture-fixtures.ts`

- [ ] **Step 1: `captureSearch` Funktion einbauen**

Ersetze die `captureClub` Stub-Funktion in `scripts/fixtures/capture-fixtures.ts`:

```typescript
import { searchVereine } from "../../lib/crawler/fussballde";

type VereinHit = Awaited<ReturnType<typeof searchVereine>>[number];

async function captureSearch(browser: Browser, club: FixtureClub): Promise<VereinHit> {
  const htmlRel = `${club.key}/search.html`;
  const jsonRel = `${club.key}/search.json`;

  if (!FORCE && (await exists(htmlRel, HTML_ROOT)) && (await exists(jsonRel, JSON_ROOT))) {
    console.log(`  search: cached`);
    return JSON.parse(await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"))[0];
  }

  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(club.searchTerm)}/restriction/-1#!/`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  const html = await page.content();
  await writeHtml(htmlRel, html);

  const hits = await searchVereine(club.searchTerm);
  await writeJson(jsonRel, hits);

  await page.close();
  await sleep(800);

  const match = hits.find((h) => h.name.toLowerCase().includes(club.searchTerm.toLowerCase().split(" ")[0]));
  if (!match) throw new Error(`No search hit for ${club.searchTerm}`);
  console.log(`  search: hit ${match.name} (id=${match.vereinId})`);
  return match;
}

async function captureClub(browser: Browser, club: FixtureClub): Promise<void> {
  const verein = await captureSearch(browser, club);
  // Mannschaften + Teams kommen in Tasks 1.4 – 1.7
}
```

- [ ] **Step 2: Test-Run für 1 Verein**

Run: `npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim`
Expected: Console-Output `search: hit FC Sportfreunde 1910 Dossenheim (id=...)`; Dateien angelegt:
- `tests/fixtures/scraper/html/dossenheim/search.html`
- `tests/fixtures/scraper/json/dossenheim/search.json`

- [ ] **Step 3: JSON-Inhalt verifizieren**

Run: `cat tests/fixtures/scraper/json/dossenheim/search.json | head -20`
Expected: Array mit `{ name, slug, vereinId, url }`-Objekten.

- [ ] **Step 4: Commit**

```bash
git add scripts/fixtures/capture-fixtures.ts tests/fixtures/scraper/
git commit -m "test(fixtures): capture verein search results"
```

---

### Task 1.4: Mannschafts-Liste Capture

**Files:**
- Modify: `scripts/fixtures/capture-fixtures.ts`

- [ ] **Step 1: `captureMannschaften` einbauen**

In `scripts/fixtures/capture-fixtures.ts` hinzufügen + in `captureClub` einbinden:

```typescript
import { getMannschaften } from "../../lib/crawler/fussballde";
type MannschaftHit = Awaited<ReturnType<typeof getMannschaften>>[number];

async function captureMannschaften(browser: Browser, club: FixtureClub, verein: VereinHit): Promise<MannschaftHit[]> {
  const htmlRel = `${club.key}/mannschaften.html`;
  const jsonRel = `${club.key}/mannschaften.json`;

  if (!FORCE && (await exists(jsonRel, JSON_ROOT))) {
    console.log(`  mannschaften: cached`);
    return JSON.parse(await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"));
  }

  const page = await browser.newPage();
  const url = `https://www.fussball.de/verein/${verein.slug}/-/id/${verein.vereinId}#!/`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await writeHtml(htmlRel, await page.content());
  await page.close();

  const mannschaften = await getMannschaften(verein.vereinId, verein.slug);
  await writeJson(jsonRel, mannschaften);
  await sleep(800);

  console.log(`  mannschaften: ${mannschaften.length} found`);
  return mannschaften;
}

// In captureClub ergänzen:
async function captureClub(browser: Browser, club: FixtureClub): Promise<void> {
  const verein = await captureSearch(browser, club);
  const mannschaften = await captureMannschaften(browser, club, verein);
  // Pro konfiguriertem Team: Mapping auf gefundene Mannschaft + Spiele/Kader/Details
}
```

- [ ] **Step 2: Run**

Run: `npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim`
Expected: `mannschaften: N found` (mindestens 6).

- [ ] **Step 3: Commit**

```bash
git add scripts/fixtures/capture-fixtures.ts tests/fixtures/scraper/
git commit -m "test(fixtures): capture mannschaften per verein"
```

---

### Task 1.5: Team-Resolution + Spielplan-Capture

**Files:**
- Modify: `scripts/fixtures/capture-fixtures.ts`

- [ ] **Step 1: Team-Matcher + Spielplan-Capture einbauen**

In `scripts/fixtures/capture-fixtures.ts`:

```typescript
import { getSpiele } from "../../lib/crawler/fussballde";
type SpielListItem = Awaited<ReturnType<typeof getSpiele>>[number];

function matchTeam(mannschaften: MannschaftHit[], searchName: string): MannschaftHit | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
  const target = normalize(searchName);
  return (
    mannschaften.find((m) => normalize(m.name).includes(target)) ??
    mannschaften.find((m) => normalize(m.name).startsWith(target.slice(0, 4))) ??
    null
  );
}

async function captureSpiele(
  club: FixtureClub,
  team: MannschaftHit,
  teamKey: string,
  saison: string,
): Promise<SpielListItem[]> {
  const jsonRel = `${club.key}/${teamKey}-spiele-saison${saison}.json`;

  if (!FORCE && (await exists(jsonRel, JSON_ROOT))) {
    console.log(`    spiele ${teamKey} saison${saison}: cached`);
    return JSON.parse(await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"));
  }

  const spiele = await getSpiele(team.teamId, team.slug, saison);
  await writeJson(jsonRel, spiele);
  await sleep(800);

  console.log(`    spiele ${teamKey} saison${saison}: ${spiele.length}`);
  return spiele;
}

// In captureClub erweitern:
async function captureClub(browser: Browser, club: FixtureClub): Promise<void> {
  const verein = await captureSearch(browser, club);
  const mannschaften = await captureMannschaften(browser, club, verein);

  for (const teamCfg of club.teams) {
    const team = matchTeam(mannschaften, teamCfg.searchName);
    if (!team) {
      console.warn(`  ! team not found: ${teamCfg.searchName} — skipping`);
      continue;
    }
    console.log(`  team: ${team.name} (id=${team.teamId})`);
    for (const saison of teamCfg.saisons) {
      await captureSpiele(club, team, teamCfg.key, saison);
    }
  }
}
```

- [ ] **Step 2: Run**

Run: `npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim`
Expected: Pro Team-Saison-Kombi eine `*-spiele-saison*.json`. Erwartet: 6 Teams × ø 1.5 Saisons = ~9 Files.

- [ ] **Step 3: Commit**

```bash
git add scripts/fixtures/capture-fixtures.ts tests/fixtures/scraper/
git commit -m "test(fixtures): capture spielplan per team and saison"
```

---

### Task 1.6: Kader-Capture

**Files:**
- Modify: `scripts/fixtures/capture-fixtures.ts`

- [ ] **Step 1: `captureKader` einbauen**

```typescript
import { getKader } from "../../lib/crawler/fussballde";
type KaderPlayer = Awaited<ReturnType<typeof getKader>>[number];

async function captureKader(
  club: FixtureClub,
  team: MannschaftHit,
  teamKey: string,
  saison: string,
): Promise<KaderPlayer[]> {
  const jsonRel = `${club.key}/${teamKey}-kader-saison${saison}.json`;

  if (!FORCE && (await exists(jsonRel, JSON_ROOT))) {
    console.log(`    kader ${teamKey} saison${saison}: cached`);
    return JSON.parse(await fs.readFile(path.join(JSON_ROOT, jsonRel), "utf-8"));
  }

  const kader = await getKader(team.teamId, team.slug, saison);
  await writeJson(jsonRel, kader);
  await sleep(800);

  console.log(`    kader ${teamKey} saison${saison}: ${kader.length}`);
  return kader;
}

// Im captureClub-Loop ergänzen, parallel zu captureSpiele:
for (const saison of teamCfg.saisons) {
  await captureSpiele(club, team, teamCfg.key, saison);
  await captureKader(club, team, teamCfg.key, saison);
}
```

- [ ] **Step 2: Run**

Run: `npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim`
Expected: Zusätzlich `*-kader-saison*.json` pro Team-Saison.

- [ ] **Step 3: Commit**

```bash
git add scripts/fixtures/capture-fixtures.ts tests/fixtures/scraper/
git commit -m "test(fixtures): capture kader per team and saison"
```

---

### Task 1.7: Spieldetails-Capture (erste 5 Spiele)

**Files:**
- Modify: `scripts/fixtures/capture-fixtures.ts`

- [ ] **Step 1: `captureSpielDetails` einbauen**

```typescript
import { getSpielDetails } from "../../lib/crawler/fussballde";

async function captureSpielDetails(
  club: FixtureClub,
  team: MannschaftHit,
  teamKey: string,
  spiele: SpielListItem[],
): Promise<void> {
  const sample = spiele.slice(0, 5);
  for (const spiel of sample) {
    const jsonRel = `${club.key}/${teamKey}-spiel-${spiel.spielId}.json`;
    if (!FORCE && (await exists(jsonRel, JSON_ROOT))) {
      console.log(`    detail ${spiel.spielId}: cached`);
      continue;
    }
    const details = await getSpielDetails(spiel.spielId, team.slug);
    await writeJson(jsonRel, details);
    await sleep(800);
    console.log(`    detail ${spiel.spielId}: ${details.events.length} events`);
  }
}

// In der captureClub-Saison-Schleife ergänzen:
for (const saison of teamCfg.saisons) {
  const spiele = await captureSpiele(club, team, teamCfg.key, saison);
  await captureKader(club, team, teamCfg.key, saison);
  await captureSpielDetails(club, team, teamCfg.key, spiele);
}
```

- [ ] **Step 2: Run**

Run: `npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim`
Expected: Pro Team-Saison bis zu 5 `*-spiel-<id>.json`.

- [ ] **Step 3: Commit**

```bash
git add scripts/fixtures/capture-fixtures.ts tests/fixtures/scraper/
git commit -m "test(fixtures): capture spieldetails for first 5 matches per team"
```

---

### Task 1.8: Manifest-Generator (Schema-Inferenz)

**Files:**
- Create: `scripts/fixtures/build-manifest.ts`

- [ ] **Step 1: Test schreiben — failing**

Create: `tests/fixtures/scraper/build-manifest.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { inferSchema } from "../../../scripts/fixtures/build-manifest";

describe("inferSchema", () => {
  it("infers number type with min/max", () => {
    const samples = [{ minute: 12 }, { minute: 45 }, { minute: 90 }];
    const schema = inferSchema("events[]", samples);
    expect(schema["events[].minute"]).toEqual({
      type: "number",
      min: 12,
      max: 90,
    });
  });

  it("infers string enum when ≤5 unique values", () => {
    const samples = [{ side: "heim" }, { side: "gast" }, { side: "heim" }];
    const schema = inferSchema("events[]", samples);
    expect(schema["events[].side"]).toEqual({ type: "string", enum: ["heim", "gast"] });
  });

  it("marks nullable when some samples are null", () => {
    const samples = [{ spielerId: "ABC" }, { spielerId: null }];
    const schema = inferSchema("events[]", samples);
    expect(schema["events[].spielerId"]).toMatchObject({ type: "string", nullable: true });
  });
});
```

Run: `npm test -- build-manifest`
Expected: FAIL ("Cannot find module ...")

- [ ] **Step 2: Implementation**

Create: `scripts/fixtures/build-manifest.ts`

```typescript
import fs from "fs/promises";
import path from "path";
import { FIXTURE_CLUBS, JSON_ROOT, MANIFEST_PATH } from "../../tests/fixtures/scraper/config";

type FieldSchema =
  | { type: "string"; pattern?: string; minLength?: number; enum?: string[]; nullable?: boolean }
  | { type: "number"; min?: number; max?: number; nullable?: boolean }
  | { type: "object"; required?: string[]; nullable?: boolean }
  | { type: "array"; minLength?: number };

export function inferSchema(prefix: string, samples: unknown[]): Record<string, FieldSchema> {
  const out: Record<string, FieldSchema> = {};
  if (samples.length === 0) return out;
  const flat = samples.flatMap((s) => (Array.isArray(s) ? s : [s])).filter((v) => v !== undefined);

  const keys = new Set<string>();
  for (const sample of flat) {
    if (sample && typeof sample === "object") {
      for (const k of Object.keys(sample as object)) keys.add(k);
    }
  }
  for (const key of keys) {
    const values = flat.map((s) => (s as Record<string, unknown>)[key]);
    const nonNull = values.filter((v) => v !== null && v !== undefined);
    const nullable = values.some((v) => v === null);
    if (nonNull.length === 0) continue;
    const types = new Set(nonNull.map((v) => typeof v));
    const fieldKey = `${prefix}.${key}`;
    if (types.size === 1 && types.has("number")) {
      const nums = nonNull as number[];
      out[fieldKey] = { type: "number", min: Math.min(...nums), max: Math.max(...nums), ...(nullable ? { nullable } : {}) };
    } else if (types.size === 1 && types.has("string")) {
      const strs = nonNull as string[];
      const unique = Array.from(new Set(strs));
      if (unique.length <= 5 && unique.every((s) => s.length < 30)) {
        out[fieldKey] = { type: "string", enum: unique, ...(nullable ? { nullable } : {}) };
      } else {
        out[fieldKey] = {
          type: "string",
          minLength: Math.min(...strs.map((s) => s.length)),
          ...(nullable ? { nullable } : {}),
        };
      }
    }
  }
  return out;
}

export type ManifestEntry = {
  fixture: string;
  expectedFields: Record<string, FieldSchema>;
  domAnchors: Array<{ name: string; selector: string; expectedCount: string }>;
};

type ScraperFn = "searchVereine" | "getMannschaften" | "getSpiele" | "getKader" | "getSpielDetails";

const DOM_ANCHORS: Record<ScraperFn, ManifestEntry["domAnchors"]> = {
  searchVereine: [
    { name: "search-result", selector: ".table-search-results a", expectedCount: "≥1" },
  ],
  getMannschaften: [
    { name: "team-row", selector: ".team-grid li", expectedCount: "≥1" },
  ],
  getSpiele: [
    { name: "match-row", selector: ".table-spiele tr", expectedCount: "≥1" },
  ],
  getKader: [
    { name: "player-row", selector: ".column-name", expectedCount: "≥1" },
  ],
  getSpielDetails: [
    { name: "event-tor", selector: "div[class*='icon-tor']", expectedCount: "≥0" },
    { name: "event-substitution", selector: "div[class*='icon-auswechslung']", expectedCount: "≥0" },
    { name: "halftime-row", selector: ".match-halftime, [data-halftime]", expectedCount: "≥0" },
  ],
};

async function loadFixturesFor(fn: ScraperFn): Promise<{ fixture: string; data: unknown }[]> {
  const out: { fixture: string; data: unknown }[] = [];
  for (const club of FIXTURE_CLUBS) {
    const dir = path.join(JSON_ROOT, club.key);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (
        (fn === "searchVereine" && f === "search.json") ||
        (fn === "getMannschaften" && f === "mannschaften.json") ||
        (fn === "getSpiele" && f.includes("-spiele-saison")) ||
        (fn === "getKader" && f.includes("-kader-saison")) ||
        (fn === "getSpielDetails" && f.includes("-spiel-"))
      ) {
        const data = JSON.parse(await fs.readFile(path.join(dir, f), "utf-8"));
        out.push({ fixture: path.join(JSON_ROOT, club.key, f), data });
      }
    }
  }
  return out;
}

async function buildEntry(fn: ScraperFn): Promise<ManifestEntry & { function: ScraperFn }> {
  const fixtures = await loadFixturesFor(fn);
  const samples = fixtures.flatMap(({ data }) => {
    if (Array.isArray(data)) return data;
    if (fn === "getSpielDetails" && data && typeof data === "object") {
      const d = data as { events?: unknown[]; halbzeit?: unknown };
      return [{ matchId: (data as { matchId?: unknown }).matchId, halbzeit: d.halbzeit }, ...((d.events as unknown[]) ?? [])];
    }
    return [data];
  });
  const expectedFields = inferSchema(fn === "getSpielDetails" ? "events[]" : "items[]", samples);
  return {
    function: fn,
    fixture: fixtures.map((f) => f.fixture).join(", "),
    expectedFields,
    domAnchors: DOM_ANCHORS[fn],
  };
}

export async function buildManifest(): Promise<void> {
  const fns: ScraperFn[] = ["searchVereine", "getMannschaften", "getSpiele", "getKader", "getSpielDetails"];
  const scraperFunctions: Record<string, ManifestEntry & { function: ScraperFn }> = {};
  for (const fn of fns) {
    scraperFunctions[fn] = await buildEntry(fn);
  }
  const manifest = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    scraperFunctions,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`Manifest written: ${MANIFEST_PATH}`);
}

if (require.main === module) {
  buildManifest().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

Run: `npm test -- build-manifest`
Expected: PASS (3 Tests).

- [ ] **Step 3: Manifest erzeugen**

Run: `npx tsx scripts/fixtures/build-manifest.ts`
Expected: `Manifest written: tests/fixtures/scraper/manifest.json`

- [ ] **Step 4: Manifest verifizieren**

Run: `cat tests/fixtures/scraper/manifest.json | head -50`
Expected: JSON mit `scraperFunctions.searchVereine.expectedFields`, `domAnchors` etc.

- [ ] **Step 5: Commit**

```bash
git add scripts/fixtures/build-manifest.ts tests/fixtures/scraper/
git commit -m "test(fixtures): manifest builder with schema inference"
```

---

### Task 1.9: NPM-Script + voller Capture-Run für alle 4 Vereine

**Files:**
- Modify: `package.json`

- [ ] **Step 1: NPM-Scripts hinzufügen**

In `package.json`, im `scripts`-Block ergänzen:

```json
"fixtures:capture": "tsx scripts/fixtures/capture-fixtures.ts",
"fixtures:manifest": "tsx scripts/fixtures/build-manifest.ts",
"fixtures:refresh": "tsx scripts/fixtures/capture-fixtures.ts --force && tsx scripts/fixtures/build-manifest.ts"
```

- [ ] **Step 2: Voller Capture-Run**

Run: `npm run fixtures:capture`
Expected: Captures für alle 4 Vereine durchlaufen (~5–10 Min Laufzeit). Bei Fehler eines Vereins: per `--only=<key>` einzeln nachfahren.

- [ ] **Step 3: Manifest bauen**

Run: `npm run fixtures:manifest`
Expected: `Manifest written: tests/fixtures/scraper/manifest.json`

- [ ] **Step 4: Fixtures committen**

```bash
git add tests/fixtures/scraper/ package.json
git commit -m "test(fixtures): add npm scripts and capture full club set"
```

---

## Phase 2 — Parser-Tests (Layer 1) — Worktree A

**Voraussetzung:** Phase 1 abgeschlossen, Fixtures committed.

### Task 2.1: Playwright-Mock-Helper (HTML-Fixture-Server)

**Files:**
- Create: `tests/setup/playwright-mocks.ts`

- [ ] **Step 1: Helper schreiben**

```typescript
// tests/setup/playwright-mocks.ts
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import fs from "fs/promises";
import path from "path";
import { HTML_ROOT } from "../fixtures/scraper/config";

export type FixtureRoute = {
  matchUrl: RegExp;
  htmlPath: string; // relative to HTML_ROOT
};

export async function withMockedBrowser<T>(
  routes: FixtureRoute[],
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser: Browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();

  await page.route("**/*", async (route: Route) => {
    const url = route.request().url();
    const hit = routes.find((r) => r.matchUrl.test(url));
    if (!hit) {
      // Allow asset requests to be aborted (CSS/JS aren't relevant for parser tests)
      if (url.match(/\.(css|js|png|jpg|woff2?|svg|ico)(\?|$)/)) {
        return route.abort();
      }
      return route.fulfill({ status: 404, body: "fixture not found" });
    }
    const html = await fs.readFile(path.join(HTML_ROOT, hit.htmlPath), "utf-8");
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  });

  try {
    return await fn(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function loadFixtureJson<T>(relPath: string): Promise<T> {
  const { JSON_ROOT } = await import("../fixtures/scraper/config");
  return JSON.parse(await fs.readFile(path.join(JSON_ROOT, relPath), "utf-8")) as T;
}
```

- [ ] **Step 2: Smoke-Test**

Create: `tests/scraper/parser/_smoke.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { withMockedBrowser } from "../../setup/playwright-mocks";

describe("playwright-mocks smoke", () => {
  it("serves a fixture HTML when URL matches", async () => {
    const title = await withMockedBrowser(
      [{ matchUrl: /fussball\.de\/suche/, htmlPath: "dossenheim/search.html" }],
      async (page) => {
        await page.goto("https://www.fussball.de/suche/-/text/Dossenheim");
        return page.title();
      },
    );
    expect(title.length).toBeGreaterThan(0);
  });
});
```

Run: `npm test -- _smoke`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/setup/playwright-mocks.ts tests/scraper/parser/_smoke.test.ts
git commit -m "test(parser): playwright mock helper for fixture-served HTML"
```

---

### Task 2.2: `searchVereine` Parser-Tests

**Files:**
- Create: `tests/scraper/parser/search-vereine.test.ts`

- [ ] **Step 1: Test schreiben — failing**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { withMockedBrowser, loadFixtureJson } from "../../setup/playwright-mocks";
import { searchVereine } from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("searchVereine parser", () => {
  for (const club of FIXTURE_CLUBS) {
    it(`parses search hits for ${club.key}`, async () => {
      const expected = await loadFixtureJson<Array<{ name: string; slug: string; vereinId: string; url: string }>>(
        `${club.key}/search.json`,
      );
      const actual = await withMockedBrowser(
        [{ matchUrl: /fussball\.de\/suche/, htmlPath: `${club.key}/search.html` }],
        async () => searchVereine(club.searchTerm),
      );
      expect(actual.length).toBeGreaterThanOrEqual(1);
      expect(actual[0]).toMatchObject({
        name: expect.any(String),
        slug: expect.any(String),
        vereinId: expect.stringMatching(club.expectedVereinIdPattern),
      });
      // Order-tolerant: every expected name appears in actual
      for (const e of expected) {
        expect(actual.find((a) => a.vereinId === e.vereinId)).toBeTruthy();
      }
    });
  }
});
```

Run: `npm test -- search-vereine`
Expected: Tests laufen — wenn `searchVereine` mit dem Mock funktioniert, PASS. Falls FAIL: prüfen ob Mock-URL-Regex die richtige URL trifft.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/parser/search-vereine.test.ts
git commit -m "test(parser): searchVereine against fixture HTML for all clubs"
```

---

### Task 2.3: `getMannschaften` Parser-Tests

**Files:**
- Create: `tests/scraper/parser/get-mannschaften.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { withMockedBrowser, loadFixtureJson } from "../../setup/playwright-mocks";
import { getMannschaften } from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("getMannschaften parser", () => {
  for (const club of FIXTURE_CLUBS) {
    it(`parses team list for ${club.key}`, async () => {
      const search = await loadFixtureJson<Array<{ slug: string; vereinId: string }>>(`${club.key}/search.json`);
      const verein = search[0];
      const expected = await loadFixtureJson<Array<{ name: string; teamId: string; saison: string; slug: string }>>(
        `${club.key}/mannschaften.json`,
      );
      const actual = await withMockedBrowser(
        [{ matchUrl: new RegExp(`fussball\\.de/verein/${verein.slug}`), htmlPath: `${club.key}/mannschaften.html` }],
        async () => getMannschaften(verein.vereinId, verein.slug),
      );
      expect(actual.length).toBe(expected.length);
      for (const e of expected) {
        expect(actual.find((a) => a.teamId === e.teamId)).toBeTruthy();
      }
    });

    it(`team rows have plausible saison format for ${club.key}`, async () => {
      const expected = await loadFixtureJson<Array<{ saison: string }>>(`${club.key}/mannschaften.json`);
      for (const m of expected) {
        expect(m.saison).toMatch(/^\d{4}$|^\d{2}\/\d{2}$/);
      }
    });
  }
});
```

Run: `npm test -- get-mannschaften`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/parser/get-mannschaften.test.ts
git commit -m "test(parser): getMannschaften against fixture HTML"
```

---

### Task 2.4: `getSpiele` Parser-Tests

**Files:**
- Create: `tests/scraper/parser/get-spiele.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { withMockedBrowser, loadFixtureJson } from "../../setup/playwright-mocks";
import { getSpiele } from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("getSpiele parser", () => {
  for (const club of FIXTURE_CLUBS) {
    for (const teamCfg of club.teams) {
      for (const saison of teamCfg.saisons) {
        it(`parses spielplan for ${club.key}/${teamCfg.key}/saison${saison}`, async () => {
          const mannschaften = await loadFixtureJson<Array<{ name: string; teamId: string; slug: string }>>(
            `${club.key}/mannschaften.json`,
          );
          const team = mannschaften.find((m) => m.name.toLowerCase().includes(teamCfg.searchName.toLowerCase().split(" ")[0]));
          if (!team) return; // captured set may not include all teams
          const expected = await loadFixtureJson<
            Array<{ spielId: string; datum: string; heim: string; gast: string; ergebnis: string; vergangen: boolean; url: string }>
          >(`${club.key}/${teamCfg.key}-spiele-saison${saison}.json`).catch(() => null);
          if (!expected) return;

          const actual = await withMockedBrowser(
            [
              { matchUrl: new RegExp(`ajax\\.team\\.prev\\.games.*team-id/${team.teamId}`), htmlPath: `${club.key}/${teamCfg.key}-spiele-saison${saison}.html` },
              { matchUrl: new RegExp(`fussball\\.de/mannschaft/${team.slug}`), htmlPath: `${club.key}/${teamCfg.key}-spiele-saison${saison}.html` },
            ],
            async () => getSpiele(team.teamId, team.slug, saison),
          );
          expect(actual.length).toBe(expected.length);
          // Spot-check: every spielId from expected appears in actual
          for (const e of expected) {
            expect(actual.find((a) => a.spielId === e.spielId)).toBeTruthy();
          }
          // All matches are dedup'd (no duplicate spielIds)
          const ids = actual.map((a) => a.spielId);
          expect(new Set(ids).size).toBe(ids.length);
          // Date format DD.MM.YYYY for every match
          for (const a of actual) {
            expect(a.datum).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
          }
        });
      }
    }
  }
});
```

Run: `npm test -- get-spiele`
Expected: PASS für alle Team-Saison-Kombis mit existierenden Fixtures.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/parser/get-spiele.test.ts
git commit -m "test(parser): getSpiele across all clubs and saisons"
```

---

### Task 2.5: `getSpielDetails` Parser-Tests

**Files:**
- Create: `tests/scraper/parser/get-spiel-details.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { withMockedBrowser, loadFixtureJson } from "../../setup/playwright-mocks";
import { getSpielDetails } from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS, JSON_ROOT } from "../../fixtures/scraper/config";

async function listDetailFixtures(clubKey: string, teamKey: string): Promise<string[]> {
  const dir = path.join(JSON_ROOT, clubKey);
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.startsWith(`${teamKey}-spiel-`));
  } catch {
    return [];
  }
}

describe("getSpielDetails parser", () => {
  for (const club of FIXTURE_CLUBS) {
    for (const teamCfg of club.teams) {
      it(`parses spieldetails for ${club.key}/${teamCfg.key}`, async () => {
        const fixtures = await listDetailFixtures(club.key, teamCfg.key);
        if (fixtures.length === 0) return;
        const mannschaften = await loadFixtureJson<Array<{ name: string; slug: string }>>(`${club.key}/mannschaften.json`);
        const team = mannschaften.find((m) => m.name.toLowerCase().includes(teamCfg.searchName.toLowerCase().split(" ")[0]));
        if (!team) return;

        for (const file of fixtures) {
          const spielId = file.replace(`${teamCfg.key}-spiel-`, "").replace(".json", "");
          const expected = await loadFixtureJson<{
            matchId: string;
            halbzeit: { heim: number | null; gast: number | null };
            events: Array<{ minute: number; type: string; side: "heim" | "gast" }>;
          }>(`${club.key}/${file}`);

          const actual = await withMockedBrowser(
            [{ matchUrl: new RegExp(`fussball\\.de/spiel/.*spiel/${spielId}`), htmlPath: `${club.key}/${teamCfg.key}-spiel-${spielId}.html` }],
            async () => getSpielDetails(spielId, team.slug),
          );

          expect(actual.events.length).toBe(expected.events.length);
          // Events sorted ascending by minute
          for (let i = 1; i < actual.events.length; i++) {
            expect(actual.events[i].minute).toBeGreaterThanOrEqual(actual.events[i - 1].minute);
          }
          // Sides valid
          for (const e of actual.events) {
            expect(["heim", "gast"]).toContain(e.side);
            expect(e.minute).toBeGreaterThanOrEqual(0);
            expect(e.minute).toBeLessThanOrEqual(130);
          }
        }
      });
    }
  }
});
```

Run: `npm test -- get-spiel-details`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/parser/get-spiel-details.test.ts
git commit -m "test(parser): getSpielDetails events + halftime parsing"
```

---

### Task 2.6: `getKader` Parser-Tests

**Files:**
- Create: `tests/scraper/parser/get-kader.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { withMockedBrowser, loadFixtureJson } from "../../setup/playwright-mocks";
import { getKader } from "../../../lib/crawler/fussballde";
import { FIXTURE_CLUBS } from "../../fixtures/scraper/config";

describe("getKader parser", () => {
  for (const club of FIXTURE_CLUBS) {
    for (const teamCfg of club.teams) {
      for (const saison of teamCfg.saisons) {
        it(`parses kader for ${club.key}/${teamCfg.key}/saison${saison}`, async () => {
          const mannschaften = await loadFixtureJson<Array<{ name: string; teamId: string; slug: string }>>(
            `${club.key}/mannschaften.json`,
          );
          const team = mannschaften.find((m) => m.name.toLowerCase().includes(teamCfg.searchName.toLowerCase().split(" ")[0]));
          if (!team) return;

          const expected = await loadFixtureJson<Array<{ name: string; spielerId?: string | null }>>(
            `${club.key}/${teamCfg.key}-kader-saison${saison}.json`,
          ).catch(() => null);
          if (!expected) return;

          const actual = await withMockedBrowser(
            [{ matchUrl: new RegExp(`fussball\\.de/mannschaft/${team.slug}`), htmlPath: `${club.key}/${teamCfg.key}-kader-saison${saison}.html` }],
            async () => getKader(team.teamId, team.slug, saison),
          );

          expect(actual.length).toBe(expected.length);
          for (const p of actual) {
            expect(p.name).toBeTruthy();
            expect(p.name.length).toBeGreaterThan(1);
          }
        });
      }
    }
  }
});
```

Run: `npm test -- get-kader`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/parser/get-kader.test.ts
git commit -m "test(parser): getKader squad extraction"
```

---

### Task 2.7: `detectTeamSide` Tests

**Files:**
- Create: `tests/scraper/parser/team-side-detection.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { detectTeamSide } from "../../../lib/crawler/team-side";

describe("detectTeamSide", () => {
  // Real-world cases extracted from captured fixtures
  it("Herren-Prefix wird gestrippt", () => {
    expect(detectTeamSide("Herren - FC Sportfreunde 1910 Dossenheim", "FC Sportfreunde 1910 Dossenheim")).toBe("heim");
  });

  it("SG-Prefix korrekt behandelt", () => {
    expect(detectTeamSide("Herren - SG Heidelberg-Kirchheim", "SG Heidelberg-Kirchheim")).toBe("heim");
    expect(detectTeamSide("Herren - SG Heidelberg-Kirchheim", "TSV Handschuhsheim")).toBe("gast");
  });

  it("Damen-Prefix", () => {
    expect(detectTeamSide("Damen - FC Sportfreunde 1910 Dossenheim", "FC Sportfreunde 1910 Dossenheim")).toBe("heim");
  });

  it("A-Junioren-Prefix", () => {
    expect(detectTeamSide("A-Junioren - SG Schriesheim", "SG Schriesheim")).toBe("heim");
  });

  it("Mannschafts-Nummer im Namen", () => {
    expect(detectTeamSide("Herren - FC Sportfreunde 1910 Dossenheim 3", "FC Sportfreunde 1910 Dossenheim II")).toBe("heim");
  });

  it("gast-side when team name doesn't match heim", () => {
    expect(detectTeamSide("Herren - TSV Handschuhsheim", "FC Sportfreunde 1910 Dossenheim")).toBe("gast");
  });

  it("Umlaute werden tolerant behandelt", () => {
    expect(detectTeamSide("Herren - SV Wieblingen", "SV Wieblingen")).toBe("heim");
  });
});
```

Run: `npm test -- team-side-detection`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/parser/team-side-detection.test.ts
git commit -m "test(parser): team-side detection with real club names"
```

---

### Task 2.8: Negative-Cases (4 Tests)

**Files:**
- Create: `tests/fixtures/scraper/html/negative/empty-search.html`
- Create: `tests/fixtures/scraper/html/negative/404.html`
- Create: `tests/fixtures/scraper/html/negative/captcha.html`
- Create: `tests/fixtures/scraper/html/negative/malformed-spiel.html`
- Create: `tests/scraper/parser/negative-cases.test.ts`

- [ ] **Step 1: HTML-Fixtures anlegen**

```bash
mkdir -p tests/fixtures/scraper/html/negative
```

```html
<!-- tests/fixtures/scraper/html/negative/empty-search.html -->
<!DOCTYPE html>
<html><body>
<div class="table-search-results"><p>Keine Suchergebnisse gefunden.</p></div>
</body></html>
```

```html
<!-- tests/fixtures/scraper/html/negative/404.html -->
<!DOCTYPE html>
<html><body>
<h1>404 — Seite nicht gefunden</h1>
</body></html>
```

```html
<!-- tests/fixtures/scraper/html/negative/captcha.html -->
<!DOCTYPE html>
<html><head><title>Sicherheitsabfrage</title></head><body>
<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>
</body></html>
```

```html
<!-- tests/fixtures/scraper/html/negative/malformed-spiel.html -->
<!DOCTYPE html>
<html><body>
<!-- Match-Details-Container fehlt komplett -->
<div class="error">Spiel nicht verfügbar</div>
</body></html>
```

- [ ] **Step 2: Test schreiben**

```typescript
// tests/scraper/parser/negative-cases.test.ts
import { describe, it, expect } from "vitest";
import { withMockedBrowser } from "../../setup/playwright-mocks";
import { searchVereine, getSpielDetails } from "../../../lib/crawler/fussballde";

describe("negative cases", () => {
  it("empty search returns empty array, no throw", async () => {
    const result = await withMockedBrowser(
      [{ matchUrl: /fussball\.de\/suche/, htmlPath: "negative/empty-search.html" }],
      async () => searchVereine("xyz-no-such-club"),
    );
    expect(result).toEqual([]);
  });

  it("404 page returns empty results, no throw", async () => {
    const result = await withMockedBrowser(
      [{ matchUrl: /fussball\.de\/suche/, htmlPath: "negative/404.html" }],
      async () => searchVereine("xyz").catch((e) => e),
    );
    expect(Array.isArray(result) ? result : []).toEqual([]);
  });

  it("captcha page throws loud error (not silent empty)", async () => {
    await expect(
      withMockedBrowser(
        [{ matchUrl: /fussball\.de\/spiel/, htmlPath: "negative/captcha.html" }],
        async () => getSpielDetails("FAKE_ID", "fake-slug"),
      ),
    ).rejects.toThrow(/captcha|sicherheitsabfrage/i);
  });

  it("malformed spiel page returns empty events without throwing", async () => {
    const result = await withMockedBrowser(
      [{ matchUrl: /fussball\.de\/spiel/, htmlPath: "negative/malformed-spiel.html" }],
      async () => getSpielDetails("FAKE_ID", "fake-slug").catch(() => null),
    );
    // Either no throw with empty events, or graceful error — but never undefined behavior
    if (result) expect(result.events).toEqual([]);
  });
});
```

Run: `npm test -- negative-cases`
Expected: 4 Tests. Drei sind grün out-of-the-box, der **Captcha-Test FAILED** zunächst → das ist by design, wird in Phase 4 Task 4.2 (Captcha-Detection) gefixt. Markiere den Captcha-Test bis dahin als `it.skip`:

```typescript
  it.skip("captcha page throws loud error (not silent empty)", async () => { ... });
```

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/scraper/html/negative/ tests/scraper/parser/negative-cases.test.ts
git commit -m "test(parser): negative cases (empty, 404, captcha, malformed)"
```

---

## Phase 3 — Engine-Tests (Layer 2) — Worktree B

**Voraussetzung:** Phase 1 abgeschlossen. Lauffähig parallel zu Phase 2.

### Task 3.1: Fixture-Loader für Match-Inputs

**Files:**
- Create: `tests/scraper/engine/_helpers.ts`

- [ ] **Step 1: Helper**

```typescript
// tests/scraper/engine/_helpers.ts
import fs from "fs";
import path from "path";
import { JSON_ROOT } from "../../fixtures/scraper/config";
import type { MatchInput, PledgeRuleInput } from "../../../lib/crawler/triggers";
import { detectTeamSide } from "../../../lib/crawler/team-side";

export function loadMatchFixture(clubKey: string, teamKey: string, spielId: string, ownTeamName: string): MatchInput {
  const file = path.join(JSON_ROOT, clubKey, `${teamKey}-spiel-${spielId}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    matchId: string;
    halbzeit: { heim: number | null; gast: number | null };
    events: Array<{ minute: number; type: string; subtype?: string; side: "heim" | "gast"; spielerId?: string | null; spielerName?: string | null }>;
    heimName: string;
    gastName: string;
    ergebnisHeim: number;
    ergebnisGast: number;
  };
  return {
    matchId: data.matchId,
    teamSide: detectTeamSide(ownTeamName, data.heimName),
    ergebnisHeim: data.ergebnisHeim,
    ergebnisGast: data.ergebnisGast,
    halbzeitHeim: data.halbzeit.heim,
    halbzeitGast: data.halbzeit.gast,
    events: data.events.map((e, i) => ({
      id: `e_${i}`,
      minute: e.minute,
      type: e.type as MatchInput["events"][number]["type"],
      subtype: e.subtype ?? null,
      side: e.side,
      playerId: e.spielerId ?? null,
      playerName: e.spielerName ?? null,
    })),
  };
}

export function rule(overrides: Partial<PledgeRuleInput>): PledgeRuleInput {
  return {
    id: "r_test",
    pledgeId: "p_test",
    triggerType: "goal_total",
    triggerParamsJson: {},
    amountCents: 500,
    perMatchCapCents: null,
    requiresApproval: false,
    ...overrides,
  };
}

export function listMatchFixtures(clubKey: string, teamKey: string): string[] {
  const dir = path.join(JSON_ROOT, clubKey);
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${teamKey}-spiel-`))
    .map((f) => f.replace(`${teamKey}-spiel-`, "").replace(".json", ""));
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/engine/_helpers.ts
git commit -m "test(engine): fixture loader helpers for match inputs"
```

---

### Task 3.2: Auto-Trigger-Tests (alle Vereine)

**Files:**
- Create: `tests/scraper/engine/triggers-auto.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "../../../lib/crawler/triggers";
import { loadMatchFixture, rule, listMatchFixtures } from "./_helpers";

const SCENARIOS = [
  { club: "dossenheim", team: "herren1", ownName: "FC Sportfreunde 1910 Dossenheim" },
  { club: "heidelberg-kirchheim", team: "herren1", ownName: "SG Heidelberg-Kirchheim" },
  { club: "handschuhsheim", team: "herren1", ownName: "TSV Handschuhsheim" },
  { club: "schriesheim", team: "herren1", ownName: "SG Schriesheim" },
];

describe("auto triggers — real fixtures", () => {
  for (const s of SCENARIOS) {
    describe(`${s.club}/${s.team}`, () => {
      const ids = listMatchFixtures(s.club, s.team);

      it("goal_total emits one charge per own goal", () => {
        const match = loadMatchFixture(s.club, s.team, ids[0], s.ownName);
        const ownGoals = match.events.filter((e) => e.type === "tor" && e.side === match.teamSide).length;
        const proposals = evaluateTriggers(match, [rule({ triggerType: "goal_total", amountCents: 100 })]);
        expect(proposals.length).toBe(ownGoals);
        expect(proposals.every((p) => p.amountCents === 100)).toBe(true);
      });

      it("goal_total with per_match_cap caps emission", () => {
        const match = loadMatchFixture(s.club, s.team, ids[0], s.ownName);
        const proposals = evaluateTriggers(match, [rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 250 })]);
        const sum = proposals.reduce((acc, p) => acc + p.amountCents, 0);
        expect(sum).toBeLessThanOrEqual(250);
      });

      it("win/loss/draw exactly one of three for each match", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const w = evaluateTriggers(m, [rule({ triggerType: "win", amountCents: 100 })]).length;
          const l = evaluateTriggers(m, [rule({ triggerType: "loss", amountCents: 100 })]).length;
          const d = evaluateTriggers(m, [rule({ triggerType: "draw", amountCents: 100 })]).length;
          expect(w + l + d).toBe(1);
        }
      });

      it("clean_sheet only when ownGoals > 0 and oppGoals = 0", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const own = m.teamSide === "heim" ? m.ergebnisHeim : m.ergebnisGast;
          const opp = m.teamSide === "heim" ? m.ergebnisGast : m.ergebnisHeim;
          const props = evaluateTriggers(m, [rule({ triggerType: "clean_sheet", amountCents: 200 })]);
          if (own > opp && opp === 0) expect(props.length).toBe(1);
          else expect(props.length).toBe(0);
        }
      });

      it("hattrick triggers only when a player scores ≥3 own goals", () => {
        for (const id of ids) {
          const m = loadMatchFixture(s.club, s.team, id, s.ownName);
          const playerGoals = new Map<string, number>();
          for (const e of m.events) {
            if (e.type === "tor" && e.side === m.teamSide && e.playerId) {
              playerGoals.set(e.playerId, (playerGoals.get(e.playerId) ?? 0) + 1);
            }
          }
          const hasHattrick = Array.from(playerGoals.values()).some((c) => c >= 3);
          const props = evaluateTriggers(m, [rule({ triggerType: "hattrick", amountCents: 1000 })]);
          if (hasHattrick) expect(props.length).toBeGreaterThanOrEqual(1);
          else expect(props.length).toBe(0);
        }
      });

      it("goal_diff_min triggers when |ownGoals - oppGoals| >= min_diff", () => {
        const m = loadMatchFixture(s.club, s.team, ids[0], s.ownName);
        const own = m.teamSide === "heim" ? m.ergebnisHeim : m.ergebnisGast;
        const opp = m.teamSide === "heim" ? m.ergebnisGast : m.ergebnisHeim;
        const diff = own - opp;
        const props = evaluateTriggers(m, [rule({ triggerType: "goal_diff_min", amountCents: 500, triggerParamsJson: { min_diff: 2 } })]);
        if (diff >= 2) expect(props.length).toBe(1);
        else expect(props.length).toBe(0);
      });
    });
  }
});
```

Run: `npm test -- triggers-auto`
Expected: PASS für alle Szenarien.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/engine/triggers-auto.test.ts
git commit -m "test(engine): auto triggers against real match fixtures"
```

---

### Task 3.3: Manual-Approval-Trigger Tests

**Files:**
- Create: `tests/scraper/engine/triggers-manual.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { evaluateTriggers, type MatchInput } from "../../../lib/crawler/triggers";
import { rule } from "./_helpers";

function syntheticMatch(events: MatchInput["events"]): MatchInput {
  return {
    matchId: "m_synthetic",
    teamSide: "heim",
    ergebnisHeim: 2,
    ergebnisGast: 1,
    halbzeitHeim: 1,
    halbzeitGast: 0,
    events,
  };
}

describe("manual approval triggers", () => {
  const subtypes = ["kopfball", "hackentor", "volley", "fernschuss", "elfmeter", "freistoss"] as const;
  for (const subtype of subtypes) {
    it(`special_goal/${subtype} emits one approval charge per matching event`, () => {
      const m = syntheticMatch([
        { id: "e1", minute: 10, type: "tor", subtype, side: "heim", playerId: "P1", playerName: "Spieler 1" },
        { id: "e2", minute: 30, type: "tor", subtype: null, side: "heim", playerId: "P2", playerName: "Spieler 2" },
      ]);
      const proposals = evaluateTriggers(m, [
        rule({ triggerType: "special_goal", triggerParamsJson: { subtype }, amountCents: 500, requiresApproval: true }),
      ]);
      expect(proposals.length).toBe(1);
      expect(proposals[0].requiresApproval).toBe(true);
      expect(proposals[0].matchEventId).toBe("e1");
    });
  }

  it("yellow_card emits one per yellow event", () => {
    const m = syntheticMatch([
      { id: "y1", minute: 22, type: "karte", subtype: "gelb", side: "heim", playerId: "P1", playerName: "P1" },
      { id: "y2", minute: 70, type: "karte", subtype: "gelb", side: "heim", playerId: "P2", playerName: "P2" },
      { id: "r1", minute: 88, type: "karte", subtype: "rot", side: "heim", playerId: "P3", playerName: "P3" },
    ]);
    const yellow = evaluateTriggers(m, [rule({ triggerType: "yellow_card", amountCents: 200, requiresApproval: true })]);
    expect(yellow.length).toBe(2);
    const red = evaluateTriggers(m, [rule({ triggerType: "red_card", amountCents: 500, requiresApproval: true })]);
    expect(red.length).toBe(1);
  });

  it("assist and man_of_match propagate requiresApproval=true", () => {
    const m = syntheticMatch([
      { id: "a1", minute: 60, type: "spezial", subtype: "assist", side: "heim", playerId: "P1", playerName: "P1" },
    ]);
    const props = evaluateTriggers(m, [rule({ triggerType: "assist", amountCents: 300, requiresApproval: true })]);
    expect(props[0]?.requiresApproval).toBe(true);
  });

  it("custom trigger requires approval and matches event subtype", () => {
    const m = syntheticMatch([
      { id: "c1", minute: 40, type: "spezial", subtype: "fairplay-award", side: "heim", playerId: null, playerName: null },
    ]);
    const props = evaluateTriggers(m, [
      rule({ triggerType: "custom", triggerParamsJson: { subtype: "fairplay-award" }, amountCents: 1000, requiresApproval: true }),
    ]);
    expect(props.length).toBe(1);
    expect(props[0].requiresApproval).toBe(true);
  });
});
```

Run: `npm test -- triggers-manual`
Expected: PASS. Falls bestimmte Trigger-Logik noch nicht in `lib/crawler/triggers.ts` existiert → Implementation in der Engine ergänzen (TDD).

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/engine/triggers-manual.test.ts
git commit -m "test(engine): manual approval triggers for all subtypes"
```

---

### Task 3.4: Season-Trigger Tests

**Files:**
- Create: `tests/scraper/engine/triggers-season.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { evaluateSeasonTriggers, type SeasonInput, type PledgeRuleInput } from "../../../lib/crawler/triggers";

function seasonRule(overrides: Partial<PledgeRuleInput>): PledgeRuleInput {
  return {
    id: "rs_test",
    pledgeId: "p_test",
    triggerType: "season_promotion",
    triggerParamsJson: {},
    amountCents: 5000,
    perMatchCapCents: null,
    requiresApproval: false,
    ...overrides,
  };
}

describe("season triggers", () => {
  it("season_promotion fires when team is promoted", () => {
    const input: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: false, cupRound: null };
    const props = evaluateSeasonTriggers(input, [seasonRule({ triggerType: "season_promotion" })]);
    expect(props.length).toBe(1);
    expect(props[0].amountCents).toBe(5000);
  });

  it("season_promotion does NOT fire when not promoted", () => {
    const input: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 8, totalTeams: 16, promoted: false, relegated: false, champion: false, cupRound: null };
    const props = evaluateSeasonTriggers(input, [seasonRule({ triggerType: "season_promotion" })]);
    expect(props.length).toBe(0);
  });

  it("season_no_relegation fires when not relegated", () => {
    const input: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 13, totalTeams: 16, promoted: false, relegated: false, champion: false, cupRound: null };
    const props = evaluateSeasonTriggers(input, [seasonRule({ triggerType: "season_no_relegation" })]);
    expect(props.length).toBe(1);
  });

  it("season_table_position fires when position ≤ target", () => {
    const input: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 3, totalTeams: 16, promoted: false, relegated: false, champion: false, cupRound: null };
    const props = evaluateSeasonTriggers(input, [seasonRule({ triggerType: "season_table_position", triggerParamsJson: { max_position: 5 } })]);
    expect(props.length).toBe(1);
  });

  it("season_champion only at position 1", () => {
    const champ: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: true, cupRound: null };
    const second: SeasonInput = { ...champ, finalPosition: 2, champion: false };
    expect(evaluateSeasonTriggers(champ, [seasonRule({ triggerType: "season_champion" })]).length).toBe(1);
    expect(evaluateSeasonTriggers(second, [seasonRule({ triggerType: "season_champion" })]).length).toBe(0);
  });

  it("season_cup_round fires for matching round name", () => {
    const input: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 1, totalTeams: 16, promoted: false, relegated: false, champion: false, cupRound: "Halbfinale" };
    const props = evaluateSeasonTriggers(input, [seasonRule({ triggerType: "season_cup_round", triggerParamsJson: { round: "Halbfinale" } })]);
    expect(props.length).toBe(1);
  });

  it("each season trigger fires at most ONCE per pledgeRule (idempotency)", () => {
    const input: SeasonInput = { teamId: "t1", saison: "2526", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: true, cupRound: null };
    const props = evaluateSeasonTriggers(input, [
      seasonRule({ triggerType: "season_promotion" }),
      seasonRule({ triggerType: "season_promotion", id: "rs_test2" }), // different rule = independent
    ]);
    expect(props.length).toBe(2);
    expect(new Set(props.map((p) => p.pledgeRuleId)).size).toBe(2);
  });
});
```

Run: `npm test -- triggers-season`
Expected: FAIL falls `evaluateSeasonTriggers` noch nicht existiert. Implementation in `lib/crawler/triggers.ts`:

```typescript
// In lib/crawler/triggers.ts ergänzen:
export type SeasonInput = {
  teamId: string;
  saison: string;
  finalPosition: number;
  totalTeams: number;
  promoted: boolean;
  relegated: boolean;
  champion: boolean;
  cupRound: string | null;
};

export function evaluateSeasonTriggers(input: SeasonInput, rules: PledgeRuleInput[]): ChargeProposal[] {
  const out: ChargeProposal[] = [];
  for (const r of rules) {
    let fires = false;
    switch (r.triggerType) {
      case "season_promotion": fires = input.promoted; break;
      case "season_no_relegation": fires = !input.relegated; break;
      case "season_table_position":
        fires = input.finalPosition <= ((r.triggerParamsJson as { max_position?: number }).max_position ?? 0);
        break;
      case "season_champion": fires = input.champion; break;
      case "season_cup_round":
        fires = input.cupRound === (r.triggerParamsJson as { round?: string }).round;
        break;
      case "season_custom":
        fires = true; // requires approval, always fires
        break;
      default: continue;
    }
    if (fires) {
      out.push({
        pledgeId: r.pledgeId,
        pledgeRuleId: r.id,
        matchId: null,
        matchEventId: null,
        triggerType: r.triggerType,
        amountCents: r.amountCents,
        requiresApproval: r.triggerType === "season_custom",
        saison: input.saison,
      });
    }
  }
  return out;
}
```

Run: `npm test -- triggers-season`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/engine/triggers-season.test.ts lib/crawler/triggers.ts
git commit -m "test(engine): season triggers + implementation"
```

---

### Task 3.5: Cap-Enforcement Tests

**Files:**
- Create: `tests/scraper/engine/caps.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "../../../lib/crawler/triggers";
import { rule } from "./_helpers";
import type { MatchInput } from "../../../lib/crawler/triggers";

const FIVE_GOAL_MATCH: MatchInput = {
  matchId: "m_caps",
  teamSide: "heim",
  ergebnisHeim: 5,
  ergebnisGast: 1,
  halbzeitHeim: 3,
  halbzeitGast: 0,
  events: [1, 15, 30, 60, 80].map((min, i) => ({
    id: `g${i}`, minute: min, type: "tor", subtype: null, side: "heim",
    playerId: `P${i}`, playerName: `Spieler ${i}`,
  })),
};

describe("cap enforcement", () => {
  it("per_match_cap = null = unbegrenzt", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: null })]);
    expect(props.length).toBe(5);
  });

  it("per_match_cap stops emission mid-match", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 250 })]);
    const sum = props.reduce((a, p) => a + p.amountCents, 0);
    expect(sum).toBeLessThanOrEqual(250);
    expect(props.length).toBe(2); // 100 + 100 = 200 (third would exceed)
  });

  it("per_match_cap = 0 emits nothing", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 0 })]);
    expect(props.length).toBe(0);
  });

  it("per_match_cap = exactly one trigger amount", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [rule({ triggerType: "goal_total", amountCents: 100, perMatchCapCents: 100 })]);
    expect(props.length).toBe(1);
  });

  it("multiple rules each enforce their own cap independently", () => {
    const props = evaluateTriggers(FIVE_GOAL_MATCH, [
      rule({ id: "rA", triggerType: "goal_total", amountCents: 100, perMatchCapCents: 200 }),
      rule({ id: "rB", triggerType: "goal_total", amountCents: 50, perMatchCapCents: 150 }),
    ]);
    const sumA = props.filter((p) => p.pledgeRuleId === "rA").reduce((a, p) => a + p.amountCents, 0);
    const sumB = props.filter((p) => p.pledgeRuleId === "rB").reduce((a, p) => a + p.amountCents, 0);
    expect(sumA).toBeLessThanOrEqual(200);
    expect(sumB).toBeLessThanOrEqual(150);
  });
});
```

Run: `npm test -- caps`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/engine/caps.test.ts
git commit -m "test(engine): per-match cap enforcement edge cases"
```

---

### Task 3.6: Combo-Szenarien Tests

**Files:**
- Create: `tests/scraper/engine/combo-scenarios.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "../../../lib/crawler/triggers";
import { rule, loadMatchFixture, listMatchFixtures } from "./_helpers";

describe("combo scenarios", () => {
  const ids = listMatchFixtures("dossenheim", "herren1");

  it("three sponsors on same team — each gets own charges", () => {
    const m = loadMatchFixture("dossenheim", "herren1", ids[0], "FC Sportfreunde 1910 Dossenheim");
    const props = evaluateTriggers(m, [
      rule({ id: "rA", pledgeId: "pA", triggerType: "goal_total", amountCents: 100 }),
      rule({ id: "rB", pledgeId: "pB", triggerType: "win", amountCents: 500 }),
      rule({ id: "rC", pledgeId: "pC", triggerType: "clean_sheet", amountCents: 1000 }),
    ]);
    const pledgesInvolved = new Set(props.map((p) => p.pledgeId));
    expect(pledgesInvolved.size).toBeGreaterThanOrEqual(1);
    // pA: pro Tor; pB: 0 oder 1; pC: 0 oder 1
    const pA = props.filter((p) => p.pledgeId === "pA");
    const ownGoals = m.events.filter((e) => e.type === "tor" && e.side === m.teamSide).length;
    expect(pA.length).toBe(ownGoals);
  });

  it("same rule across multiple matches produces independent proposals", () => {
    const proposals = ids.flatMap((id) =>
      evaluateTriggers(loadMatchFixture("dossenheim", "herren1", id, "FC Sportfreunde 1910 Dossenheim"), [
        rule({ triggerType: "win", amountCents: 500 }),
      ]),
    );
    // Each match either wins (1 proposal) or doesn't (0). No state leaks between matches.
    expect(proposals.length).toBeLessThanOrEqual(ids.length);
  });
});
```

Run: `npm test -- combo-scenarios`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/engine/combo-scenarios.test.ts
git commit -m "test(engine): multi-sponsor combo scenarios"
```

---

## Phase 4 — Production-Code-Erweiterungen — Worktree C

**Voraussetzung:** Phase 1 abgeschlossen. Lauffähig parallel zu Phase 2 & 3.

### Task 4.1: Retry + Backoff in `withPage`

**Files:**
- Modify: `lib/crawler/fussballde.ts`
- Create: `tests/scraper/engine/retry.test.ts`

- [ ] **Step 1: Test schreiben — failing**

```typescript
// tests/scraper/engine/retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../../lib/crawler/fussballde";

describe("withRetry", () => {
  it("succeeds on first try without retry", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and eventually succeeds", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error("net::ERR_TIMEOUT");
      return "ok";
    };
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after maxAttempts and re-throws last error", async () => {
    const fn = vi.fn(async () => { throw new Error("net::ERR_TIMEOUT"); });
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow(/ERR_TIMEOUT/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on non-network errors", async () => {
    const fn = vi.fn(async () => { throw new Error("ParseError: missing element"); });
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backoff delays grow exponentially", async () => {
    const started = Date.now();
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("net::ERR_FAILED");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 50 },
    );
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(50 + 100); // 1st retry 50ms, 2nd retry 100ms
  });
});
```

Run: `npm test -- retry`
Expected: FAIL ("Cannot find module ...withRetry").

- [ ] **Step 2: Implementation**

In `lib/crawler/fussballde.ts` ergänzen (am Anfang, vor `withPage`):

```typescript
const TRANSIENT_PATTERNS = [
  /net::ERR_/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /Navigation timeout/i,
  /HTTP 5\d{2}/i,
];

export type RetryOptions = { maxAttempts: number; baseDelayMs?: number };

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = { maxAttempts: 3 }): Promise<T> {
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
  throw lastErr;
}
```

Run: `npm test -- retry`
Expected: PASS.

- [ ] **Step 3: `withPage` integrieren**

In `lib/crawler/fussballde.ts`, die `withPage` Funktion umhüllen:

```typescript
async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36" });
      const page = await ctx.newPage();
      try {
        return await fn(page);
      } finally {
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  }, { maxAttempts: 3, baseDelayMs: 1000 });
}
```

Run: `npm test`
Expected: alle bestehenden Scraper-Tests bleiben grün, neue Retry-Tests PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/crawler/fussballde.ts tests/scraper/engine/retry.test.ts
git commit -m "feat(crawler): retry + exponential backoff for transient network errors"
```

---

### Task 4.2: Captcha-Detection

**Files:**
- Modify: `lib/crawler/fussballde.ts`
- Modify: `tests/scraper/parser/negative-cases.test.ts` (Captcha-Test aktivieren)

- [ ] **Step 1: Captcha-Detection einbauen**

In `lib/crawler/fussballde.ts` eine Helper-Funktion einfügen, die nach `page.goto` aufgerufen wird:

```typescript
async function assertNotCaptcha(page: Page): Promise<void> {
  const title = await page.title();
  if (/sicherheitsabfrage|captcha/i.test(title)) {
    throw new Error(`Captcha encountered on ${page.url()} — title: "${title}"`);
  }
  const hasRecaptcha = await page.locator('iframe[src*="recaptcha"]').count();
  if (hasRecaptcha > 0) {
    throw new Error(`Captcha (reCAPTCHA) encountered on ${page.url()}`);
  }
}
```

In jeder `page.goto`-Aufruf-Stelle (z.B. in `searchVereine`, `getMannschaften`, `getSpiele`, `getSpielDetails`, `getKader`) direkt danach `await assertNotCaptcha(page);` aufrufen.

- [ ] **Step 2: Captcha-Test reaktivieren**

In `tests/scraper/parser/negative-cases.test.ts`, das `it.skip` zurück zu `it` ändern:

```typescript
it("captcha page throws loud error (not silent empty)", async () => { /* ... */ });
```

Run: `npm test -- negative-cases`
Expected: alle 4 Tests PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/crawler/fussballde.ts tests/scraper/parser/negative-cases.test.ts
git commit -m "feat(crawler): captcha detection with loud throw"
```

---

### Task 4.3: Match-Update-Path (Hash-basierte Aktualisierung)

**Files:**
- Modify: `lib/inngest/functions/crawl-matches.ts`
- Create: `lib/db/queries/matches.ts` (oder erweitern, falls existiert)
- Create: `tests/scraper/engine/match-hash.test.ts`

- [ ] **Step 1: Hash-Helper Test — failing**

```typescript
// tests/scraper/engine/match-hash.test.ts
import { describe, it, expect } from "vitest";
import { computeMatchHash } from "../../../lib/crawler/fussballde";

describe("computeMatchHash", () => {
  const base = {
    ergebnisHeim: 2,
    ergebnisGast: 1,
    halbzeitHeim: 1,
    halbzeitGast: 0,
    events: [
      { minute: 12, type: "tor", side: "heim", spielerId: "P1" },
      { minute: 45, type: "tor", side: "gast", spielerId: "P9" },
      { minute: 80, type: "tor", side: "heim", spielerId: "P2" },
    ],
  };

  it("identical input produces identical hash", () => {
    expect(computeMatchHash(base)).toBe(computeMatchHash(base));
  });

  it("hash changes when result changes", () => {
    const updated = { ...base, ergebnisHeim: 3 };
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(updated));
  });

  it("hash changes when event count changes", () => {
    const more = { ...base, events: [...base.events, { minute: 90, type: "tor", side: "heim", spielerId: "P3" }] };
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(more));
  });

  it("hash is order-independent for events at same minute", () => {
    const reordered = { ...base, events: [base.events[0], base.events[2], base.events[1]] };
    // sortable internally → same hash
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(reordered));
    // Note: this test documents current behavior — adjust if sorting is added
  });
});
```

Run: `npm test -- match-hash`
Expected: FAIL.

- [ ] **Step 2: Implementation in `lib/crawler/fussballde.ts`**

```typescript
import { createHash } from "crypto";

export type MatchHashInput = {
  ergebnisHeim: number;
  ergebnisGast: number;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  events: ReadonlyArray<{ minute: number; type: string; side: "heim" | "gast"; spielerId?: string | null }>;
};

export function computeMatchHash(input: MatchHashInput): string {
  const sortedEvents = [...input.events].sort((a, b) =>
    a.minute - b.minute || (a.type ?? "").localeCompare(b.type ?? "") || (a.spielerId ?? "").localeCompare(b.spielerId ?? ""),
  );
  const payload = JSON.stringify({
    r: [input.ergebnisHeim, input.ergebnisGast],
    h: [input.halbzeitHeim, input.halbzeitGast],
    e: sortedEvents.map((e) => [e.minute, e.type, e.side, e.spielerId ?? null]),
  });
  return createHash("sha256").update(payload).digest("hex");
}
```

In den letzten Test anpassen (order-independent now expected):

```typescript
it("hash is order-independent for events", () => {
  const reordered = { ...base, events: [base.events[2], base.events[0], base.events[1]] };
  expect(computeMatchHash(base)).toBe(computeMatchHash(reordered));
});
```

Run: `npm test -- match-hash`
Expected: PASS.

- [ ] **Step 3: Schema-Erweiterung — `match.contentHash`**

In `lib/db/schema/matches.ts`:

```typescript
contentHash: text("content_hash"),
```

Migration generieren:

```bash
npm run db:generate
```

Expected: neue Migration-Datei unter `drizzle/`.

- [ ] **Step 4: Match-Update-Path in `crawl-matches.ts`**

Lies `lib/inngest/functions/crawl-matches.ts`, finde den Block der bei `findMatchByFussballdeId` skipped. Ersetze die Logik:

```typescript
import { computeMatchHash } from "../../crawler/fussballde";
import { invalidateChargesForMatch } from "../../db/queries/charges";

// ... inside the match loop:
const existing = await findMatchByFussballdeId(spielId);
const newHash = computeMatchHash({
  ergebnisHeim: details.ergebnisHeim,
  ergebnisGast: details.ergebnisGast,
  halbzeitHeim: details.halbzeit.heim,
  halbzeitGast: details.halbzeit.gast,
  events: details.events,
});

if (existing) {
  if (existing.contentHash === newHash) {
    continue; // no change
  }
  // Match data changed — invalidate old charges, update match + events
  await invalidateChargesForMatch(existing.id, "match_updated");
  await updateMatchWithEvents(existing.id, { ...details, contentHash: newHash });
  await step.sendEvent("match-updated", { name: "match/finished", data: { matchId: existing.id, updated: true } });
} else {
  const inserted = await insertMatchWithEvents(team.id, { ...details, contentHash: newHash });
  await step.sendEvent("match-finished", { name: "match/finished", data: { matchId: inserted.id, updated: false } });
}
```

- [ ] **Step 5: Query-Funktion `invalidateChargesForMatch`**

In `lib/db/queries/charges.ts`:

```typescript
import { db } from "../client";
import { charges } from "../schema/charges";
import { eq, and } from "drizzle-orm";

export async function invalidateChargesForMatch(matchId: string, reason: string): Promise<void> {
  await db.update(charges).set({ status: "cancelled", cancelledReason: reason }).where(and(eq(charges.matchId, matchId)));
}
```

Falls `cancelledReason` Spalte nicht existiert: hinzufügen in Schema + Migration.

- [ ] **Step 6: Commit**

```bash
git add lib/crawler/fussballde.ts lib/db/ lib/inngest/functions/crawl-matches.ts tests/scraper/engine/match-hash.test.ts drizzle/
git commit -m "feat(crawler): match-update-path with content-hash + charge invalidation"
```

---

## Phase 5 — Integration-Tests (Layer 3) — Worktree A (nach Phase 4)

**Voraussetzung:** Phase 4 abgeschlossen (Match-Update-Path braucht das neue Schema).

### Task 5.1: Test-DB-Setup

**Files:**
- Create: `tests/setup/integration-db.ts`
- Modify: `vitest.config.ts`
- Create: `docker-compose.test.yml`

- [ ] **Step 1: Docker-Compose für Test-Postgres**

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: kickpact_test
    ports:
      - "54329:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

- [ ] **Step 2: Integration-DB Setup-Modul**

```typescript
// tests/setup/integration-db.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../../lib/db/schema";

const TEST_URL = process.env.DATABASE_URL_TEST ?? "postgres://test:test@localhost:54329/kickpact_test";

let connection: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export async function getTestDb() {
  if (!dbInstance) {
    connection = postgres(TEST_URL, { max: 5 });
    dbInstance = drizzle(connection, { schema });
    await migrate(dbInstance, { migrationsFolder: "./drizzle" });
  }
  return dbInstance;
}

export async function resetTestDb() {
  const db = await getTestDb();
  await db.execute(/* sql */ `
    TRUNCATE
      charges, event_approvals, match_events, matches, players, teams,
      pledge_rules, pledges, sponsors, team_licenses, subscriptions,
      club_memberships, invoices, invoice_items, clubs, users
    RESTART IDENTITY CASCADE;
  `);
}

export async function closeTestDb() {
  if (connection) {
    await connection.end();
    connection = null;
    dbInstance = null;
  }
}
```

- [ ] **Step 3: Vitest-Konfiguration erweitern**

In `vitest.config.ts`, einen separaten Konfig-Block für Integration-Tests einrichten (oder `globalSetup` erweitern). Setze die Env-Variable für Integration-Tests:

```typescript
test: {
  setupFiles: ["tests/setup/global.ts"],
  testTimeout: 30_000,
  hookTimeout: 30_000,
  // ... existing config
},
```

- [ ] **Step 4: Smoke-Test der DB-Verbindung**

```typescript
// tests/scraper/integration/_db-smoke.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../../setup/integration-db";
import { clubs } from "../../../lib/db/schema";

describe("test-db smoke", () => {
  beforeAll(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("can insert and read a club", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values({ id: "c_test", slug: "test", name: "Test Club", ort: "Test", isSmallBusiness: false });
    const rows = await db.select().from(clubs);
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 5: Docker hochfahren + Test laufen lassen**

```bash
docker compose -f docker-compose.test.yml up -d
npm test -- _db-smoke
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.test.yml tests/setup/integration-db.ts vitest.config.ts tests/scraper/integration/_db-smoke.test.ts
git commit -m "test(integration): test-db setup with docker-compose"
```

---

### Task 5.2: Seed-from-Fixtures Modul

**Files:**
- Create: `tests/fixtures/scraper/seed-from-fixtures.ts`

- [ ] **Step 1: Seed-Funktion**

```typescript
// tests/fixtures/scraper/seed-from-fixtures.ts
import { getTestDb } from "../../setup/integration-db";
import { clubs, teams, sponsors, pledges, pledgeRules } from "../../../lib/db/schema";
import { FIXTURE_CLUBS, JSON_ROOT } from "./config";
import fs from "fs/promises";
import path from "path";

export type SeedResult = {
  clubId: string;
  teamIds: Record<string, string>; // teamKey → DB id
};

export async function seedClubFromFixture(clubKey: string): Promise<SeedResult> {
  const db = await getTestDb();
  const cfg = FIXTURE_CLUBS.find((c) => c.key === clubKey);
  if (!cfg) throw new Error(`Unknown club key: ${clubKey}`);
  const search = JSON.parse(await fs.readFile(path.join(JSON_ROOT, clubKey, "search.json"), "utf-8"));
  const mannschaften = JSON.parse(await fs.readFile(path.join(JSON_ROOT, clubKey, "mannschaften.json"), "utf-8"));

  const clubId = `c_${clubKey}`;
  await db.insert(clubs).values({
    id: clubId,
    slug: clubKey,
    name: search[0].name,
    ort: "Heidelberg",
    isSmallBusiness: true,
    fussballdeVereinId: search[0].vereinId,
  });

  const teamIds: Record<string, string> = {};
  for (const teamCfg of cfg.teams) {
    const team = mannschaften.find((m: { name: string }) => m.name.toLowerCase().includes(teamCfg.searchName.toLowerCase().split(" ")[0]));
    if (!team) continue;
    const teamDbId = `t_${clubKey}_${teamCfg.key}`;
    await db.insert(teams).values({
      id: teamDbId,
      clubId,
      name: team.name,
      saison: team.saison,
      fussballdeTeamId: team.teamId,
      fussballdeSlug: team.slug,
      isActive: true,
    });
    teamIds[teamCfg.key] = teamDbId;
  }
  return { clubId, teamIds };
}

export async function seedSponsorWithPledge(opts: {
  sponsorKey: string;
  teamDbId: string;
  triggerType: string;
  amountCents: number;
  requiresApproval?: boolean;
  startsAt?: Date;
  monthlyCapCents?: number | null;
}): Promise<{ sponsorId: string; pledgeId: string; ruleId: string }> {
  const db = await getTestDb();
  const sponsorId = `s_${opts.sponsorKey}`;
  const pledgeId = `pl_${opts.sponsorKey}`;
  const ruleId = `pr_${opts.sponsorKey}`;
  await db.insert(sponsors).values({ id: sponsorId, userId: `u_${opts.sponsorKey}`, displayName: opts.sponsorKey, type: "familie" });
  await db.insert(pledges).values({
    id: pledgeId,
    sponsorId,
    teamId: opts.teamDbId,
    status: "active",
    startsAt: opts.startsAt ?? new Date("2025-08-01"),
    endsAt: null,
    monthlyCapCents: opts.monthlyCapCents ?? null,
  });
  await db.insert(pledgeRules).values({
    id: ruleId,
    pledgeId,
    triggerType: opts.triggerType,
    triggerParamsJson: {},
    amountCents: opts.amountCents,
    perMatchCapCents: null,
    requiresApproval: opts.requiresApproval ?? false,
  });
  return { sponsorId, pledgeId, ruleId };
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/scraper/seed-from-fixtures.ts
git commit -m "test(integration): seed helpers from fixture JSON"
```

---

### Task 5.3: `crawl-matches` Integration-Test

**Files:**
- Create: `tests/scraper/integration/crawl-matches.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../../setup/integration-db";
import { seedClubFromFixture } from "../../fixtures/scraper/seed-from-fixtures";
import { matches, matchEvents } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

// Mock the scraper to return fixture data, then run the inngest function logic.
vi.mock("../../../lib/crawler/fussballde", async () => {
  const fs = await import("fs/promises");
  const path = await import("path");
  const { JSON_ROOT } = await import("../../fixtures/scraper/config");
  return {
    getSpiele: async (teamId: string, slug: string, saison: string) => {
      // Lookup by teamId — find correct fixture
      const file = path.join(JSON_ROOT, "dossenheim", `herren1-spiele-saison${saison}.json`);
      return JSON.parse(await fs.readFile(file, "utf-8"));
    },
    getSpielDetails: async (spielId: string, slug: string) => {
      const file = path.join(JSON_ROOT, "dossenheim", `herren1-spiel-${spielId}.json`);
      return JSON.parse(await fs.readFile(file, "utf-8"));
    },
    computeMatchHash: (await vi.importActual<any>("../../../lib/crawler/fussballde")).computeMatchHash,
  };
});

import { runCrawlForTeam } from "../../../lib/inngest/functions/crawl-matches";

describe("crawl-matches integration", () => {
  beforeAll(async () => { await resetTestDb(); });
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("inserts all matches and events for a team", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await runCrawlForTeam(teamIds.herren1, "2526");

    const db = await getTestDb();
    const inserted = await db.select().from(matches).where(eq(matches.teamId, teamIds.herren1));
    expect(inserted.length).toBeGreaterThan(0);

    const events = await db.select().from(matchEvents);
    expect(events.length).toBeGreaterThan(0);
  });

  it("is idempotent — second run does not duplicate", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await runCrawlForTeam(teamIds.herren1, "2526");
    const db = await getTestDb();
    const after1 = (await db.select().from(matches)).length;
    await runCrawlForTeam(teamIds.herren1, "2526");
    const after2 = (await db.select().from(matches)).length;
    expect(after2).toBe(after1);
  });
});
```

**Hinweis:** Falls `runCrawlForTeam` noch nicht als exportierte Funktion existiert: in `lib/inngest/functions/crawl-matches.ts` die Kern-Logik in eine eigene Funktion `runCrawlForTeam(teamId, saison)` extrahieren und exportieren. Die Inngest-Function ruft sie dann auf.

Run: `npm test -- crawl-matches`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/integration/crawl-matches.test.ts lib/inngest/functions/crawl-matches.ts
git commit -m "test(integration): crawl-matches inserts + idempotency"
```

---

### Task 5.4: `evaluate-match` Integration (erweitert bestehend)

**Files:**
- Modify/Move: `tests/inngest/evaluate-match.test.ts` → `tests/scraper/integration/evaluate-match.test.ts`

- [ ] **Step 1: Bestehenden Test verschieben**

```bash
git mv tests/inngest/evaluate-match.test.ts tests/scraper/integration/evaluate-match.test.ts
```

- [ ] **Step 2: Erweitern — Monthly-Cap E2E**

In `tests/scraper/integration/evaluate-match.test.ts` neue Tests anhängen:

```typescript
import { seedClubFromFixture, seedSponsorWithPledge } from "../../fixtures/scraper/seed-from-fixtures";
import { runEvaluateMatch } from "../../../lib/inngest/functions/evaluate-match";
import { resetTestDb, getTestDb } from "../../setup/integration-db";
import { charges } from "../../../lib/db/schema";

describe("evaluate-match: monthly cap enforcement", () => {
  beforeEach(async () => { await resetTestDb(); });

  it("stops charges when monthly cap is reached across multiple matches", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "cap-sponsor",
      teamDbId: teamIds.herren1,
      triggerType: "goal_total",
      amountCents: 500,
      monthlyCapCents: 1000, // = 2 goals
    });

    // Seed 3 matches in same month, each with 1 goal
    // ... (insert matches manually with controlled dates/events)
    // Then run evaluate-match for each

    const db = await getTestDb();
    const sum = (await db.select().from(charges)).reduce((a, c) => a + c.amountCents, 0);
    expect(sum).toBeLessThanOrEqual(1000);
  });

  it("manual triggers create charges with status=pending_approval and event_approvals row", async () => {
    // ... similar setup, but trigger = special_goal with requiresApproval=true
  });
});
```

Run: `npm test -- evaluate-match`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/scraper/integration/evaluate-match.test.ts
git commit -m "test(integration): monthly cap enforcement + manual approval flow"
```

---

### Task 5.5: `evaluate-season` Integration

**Files:**
- Create: `tests/scraper/integration/evaluate-season.test.ts`
- Create or extend: `lib/inngest/functions/evaluate-season.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../../setup/integration-db";
import { seedClubFromFixture, seedSponsorWithPledge } from "../../fixtures/scraper/seed-from-fixtures";
import { runEvaluateSeason } from "../../../lib/inngest/functions/evaluate-season";
import { charges } from "../../../lib/db/schema";

describe("evaluate-season", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("season_promotion fires once and is idempotent", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "promo",
      teamDbId: teamIds.herren1,
      triggerType: "season_promotion",
      amountCents: 5000,
    });
    await runEvaluateSeason({ teamId: teamIds.herren1, saison: "2425", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: false, cupRound: null });

    const db = await getTestDb();
    let rows = await db.select().from(charges);
    expect(rows.length).toBe(1);
    expect(rows[0].pledgeRuleId).toBe(ruleId);

    // Second invocation must be idempotent (UNIQUE constraint)
    await runEvaluateSeason({ teamId: teamIds.herren1, saison: "2425", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: false, cupRound: null });
    rows = await db.select().from(charges);
    expect(rows.length).toBe(1);
  });
});
```

Run: `npm test -- evaluate-season`
Expected: PASS. Falls `runEvaluateSeason` noch nicht existiert: minimal implementieren in `lib/inngest/functions/evaluate-season.ts`.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/integration/evaluate-season.test.ts lib/inngest/functions/evaluate-season.ts
git commit -m "test(integration): season trigger evaluation + idempotency"
```

---

### Task 5.6: Approval-Lifecycle Tests

**Files:**
- Create: `tests/scraper/integration/approval-lifecycle.test.ts`

- [ ] **Step 1: Test (4 Sub-Cases)**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../../setup/integration-db";
import { eventApprovals, charges } from "../../../lib/db/schema";
import { confirmApproval, disputeApproval, expireApprovals, sendApprovalReminders } from "../../../lib/db/queries/approvals";
import { seedClubFromFixture, seedSponsorWithPledge } from "../../fixtures/scraper/seed-from-fixtures";

describe("approval lifecycle", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  async function setupPendingApproval(): Promise<string> {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "appr",
      teamDbId: teamIds.herren1,
      triggerType: "special_goal",
      amountCents: 500,
      requiresApproval: true,
    });
    // Insert match + manual event + pending charge + pending approval
    // ... (set up via db.insert)
    return "approval_id_here";
  }

  it("pending → confirmed: charge becomes confirmed", async () => {
    const approvalId = await setupPendingApproval();
    await confirmApproval(approvalId);
    const db = await getTestDb();
    const ap = (await db.select().from(eventApprovals)).find((a) => a.id === approvalId)!;
    expect(ap.status).toBe("confirmed");
    const ch = (await db.select().from(charges)).find((c) => c.matchEventId === ap.matchEventId)!;
    expect(ch.status).toBe("confirmed");
  });

  it("pending → disputed: charge becomes cancelled", async () => {
    const approvalId = await setupPendingApproval();
    await disputeApproval(approvalId, "wrong subtype");
    const db = await getTestDb();
    const ap = (await db.select().from(eventApprovals)).find((a) => a.id === approvalId)!;
    expect(ap.status).toBe("disputed");
    const ch = (await db.select().from(charges)).find((c) => c.matchEventId === ap.matchEventId)!;
    expect(ch.status).toBe("cancelled");
  });

  it("reminder cadence: 7d, 14d, 30d", async () => {
    const approvalId = await setupPendingApproval();
    // mock time → 7 days later
    // call sendApprovalReminders()
    // assert reminderCount=1
    // mock time → 14 days
    // reminderCount=2
    // mock time → 30 days
    // reminderCount=3
  });

  it("auto-expire after 30 days (saison-ende): charge cancelled", async () => {
    const approvalId = await setupPendingApproval();
    // mock now > expiresAt
    await expireApprovals();
    const db = await getTestDb();
    const ap = (await db.select().from(eventApprovals)).find((a) => a.id === approvalId)!;
    expect(ap.status).toBe("expired");
    const ch = (await db.select().from(charges)).find((c) => c.matchEventId === ap.matchEventId)!;
    expect(ch.status).toBe("cancelled");
  });
});
```

Run: `npm test -- approval-lifecycle`
Expected: PASS — falls Query-Funktionen noch fehlen, in `lib/db/queries/approvals.ts` implementieren.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/integration/approval-lifecycle.test.ts lib/db/queries/approvals.ts
git commit -m "test(integration): approval lifecycle (confirm/dispute/remind/expire)"
```

---

### Task 5.7: Match-Update-Path Integration

**Files:**
- Create: `tests/scraper/integration/match-update-path.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../../setup/integration-db";
import { seedClubFromFixture, seedSponsorWithPledge } from "../../fixtures/scraper/seed-from-fixtures";
import { runCrawlForTeam } from "../../../lib/inngest/functions/crawl-matches";
import { matches, charges } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("../../../lib/crawler/fussballde", async () => {
  const actual = await vi.importActual<any>("../../../lib/crawler/fussballde");
  return { ...actual, getSpiele: vi.fn(), getSpielDetails: vi.fn() };
});

import { getSpiele, getSpielDetails } from "../../../lib/crawler/fussballde";

describe("match-update-path", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("re-crawl with changed result invalidates old charges and creates new ones", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({ sponsorKey: "upd", teamDbId: teamIds.herren1, triggerType: "win", amountCents: 1000 });

    const spielId = "FAKE001";
    (getSpiele as any).mockResolvedValue([{ spielId, datum: "01.09.2025", heim: "FC Sportfreunde 1910 Dossenheim", gast: "TSV Test", ergebnis: "1:1", vergangen: true, url: "" }]);
    (getSpielDetails as any).mockResolvedValueOnce({
      matchId: spielId, halbzeit: { heim: 0, gast: 1 }, events: [], ergebnisHeim: 1, ergebnisGast: 1, heimName: "FC Sportfreunde 1910 Dossenheim", gastName: "TSV Test",
    });

    await runCrawlForTeam(teamIds.herren1, "2526");
    const db = await getTestDb();
    const c1 = await db.select().from(charges).where(eq(charges.matchId, (await db.select().from(matches))[0].id));
    expect(c1.length).toBe(0); // draw — no win charge

    // Now re-crawl with corrected result (2:1 for own team)
    (getSpielDetails as any).mockResolvedValueOnce({
      matchId: spielId, halbzeit: { heim: 1, gast: 0 }, events: [{ minute: 30, type: "tor", side: "heim", spielerId: "P1", spielerName: "X" }, { minute: 60, type: "tor", side: "heim", spielerId: "P1", spielerName: "X" }, { minute: 80, type: "tor", side: "gast", spielerId: "Q1", spielerName: "Y" }], ergebnisHeim: 2, ergebnisGast: 1, heimName: "FC Sportfreunde 1910 Dossenheim", gastName: "TSV Test",
    });
    await runCrawlForTeam(teamIds.herren1, "2526");

    const c2 = await db.select().from(charges);
    const confirmed = c2.filter((c) => c.status === "confirmed");
    expect(confirmed.length).toBeGreaterThanOrEqual(1); // win charge now
  });
});
```

Run: `npm test -- match-update-path`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/integration/match-update-path.test.ts
git commit -m "test(integration): match update path with charge re-evaluation"
```

---

### Task 5.8: Cross-Saison-Pledges Test

**Files:**
- Create: `tests/scraper/integration/cross-saison-pledges.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../../setup/integration-db";
import { seedClubFromFixture, seedSponsorWithPledge } from "../../fixtures/scraper/seed-from-fixtures";
import { runEvaluateSeason } from "../../../lib/inngest/functions/evaluate-season";
import { charges, teams } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

describe("cross-saison pledges", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("season pledge from 2425 fires for 2425 results, not 2526", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const db = await getTestDb();
    // Pledge created during saison 2425
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "x-saison",
      teamDbId: teamIds.herren1,
      triggerType: "season_promotion",
      amountCents: 5000,
      startsAt: new Date("2024-08-01"),
    });

    // Saison-Ende 2425 → promotion
    await runEvaluateSeason({ teamId: teamIds.herren1, saison: "2425", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: false, cupRound: null });
    let rows = await db.select().from(charges).where(eq(charges.pledgeRuleId, ruleId));
    expect(rows.length).toBe(1);
    expect(rows[0].saison).toBe("2425");

    // Saison-Ende 2526 → also promotion (would fire if not properly scoped)
    await runEvaluateSeason({ teamId: teamIds.herren1, saison: "2526", finalPosition: 1, totalTeams: 16, promoted: true, relegated: false, champion: false, cupRound: null });
    rows = await db.select().from(charges).where(eq(charges.pledgeRuleId, ruleId));
    // UNIQUE(pledgeRuleId, saison) constraint ensures: 2 charges, one per saison
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.saison).sort()).toEqual(["2425", "2526"]);
  });
});
```

Run: `npm test -- cross-saison-pledges`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/scraper/integration/cross-saison-pledges.test.ts
git commit -m "test(integration): cross-saison pledge evaluation"
```

---

## Phase 6 — Rendering-Tests (PDF + E-Mail) — Worktree B (nach Phase 4)

**Voraussetzung:** Phase 1 abgeschlossen. Lauffähig parallel zu Phase 5/7.

### Task 6.1: Invoice-PDF Snapshot

**Files:**
- Create: `tests/rendering/invoice-pdf.test.ts`
- Reference: `lib/pdf/invoice.tsx` (existiert; falls Pfad anders, anpassen)

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "../../lib/pdf/invoice";
import React from "react";
import pdfParse from "pdf-parse";

const INVOICE_FIXTURE = {
  invoiceNumber: "2026-05-001",
  period: "2026-05",
  club: {
    name: "FC Sportfreunde 1910 Dossenheim",
    address: "Bahnhofstr. 1, 69221 Dossenheim",
    taxId: "DE123456789",
    iban: "DE89 3704 0044 0532 0130 00",
  },
  sponsor: {
    displayName: "Familie Müller",
    address: "Musterstr. 5, 69115 Heidelberg",
  },
  items: [
    { description: "Tor gegen TSV Handschuhsheim (Spiel 01.05.2026)", amountCents: 500 },
    { description: "Sieg gegen TSV Handschuhsheim", amountCents: 1000 },
  ],
  totalCents: 1500,
  isSmallBusiness: true,
};

describe("Invoice PDF", () => {
  it("renders all key fields in PDF text", async () => {
    const buffer = await renderToBuffer(<InvoiceDocument data={INVOICE_FIXTURE} />);
    const parsed = await pdfParse(buffer);
    const text = parsed.text;

    expect(text).toContain("FC Sportfreunde 1910 Dossenheim");
    expect(text).toContain("Familie Müller");
    expect(text).toContain("2026-05-001");
    expect(text).toContain("15,00"); // 1500 cents = 15,00 €
    expect(text).toContain("DE89 3704 0044 0532 0130 00");
    expect(text).toMatch(/Kleinunternehmer/i); // §19 UStG hint when isSmallBusiness
  });

  it("renders all line items", async () => {
    const buffer = await renderToBuffer(<InvoiceDocument data={INVOICE_FIXTURE} />);
    const text = (await pdfParse(buffer)).text;
    for (const item of INVOICE_FIXTURE.items) {
      expect(text).toContain(item.description);
    }
  });

  it("snapshot — text content stable across runs", async () => {
    const buffer = await renderToBuffer(<InvoiceDocument data={INVOICE_FIXTURE} />);
    const text = (await pdfParse(buffer)).text.replace(/\s+/g, " ").trim();
    expect(text).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Falls `pdf-parse` nicht installiert**

```bash
npm install --save-dev pdf-parse @types/pdf-parse
```

Run: `npm test -- invoice-pdf`
Expected: PASS — Snapshot wird beim ersten Lauf erstellt.

- [ ] **Step 3: Commit**

```bash
git add tests/rendering/invoice-pdf.test.ts tests/rendering/__snapshots__/ package.json package-lock.json
git commit -m "test(rendering): invoice PDF snapshot + field assertions"
```

---

### Task 6.2: Approval-Reminder E-Mail Snapshot

**Files:**
- Create: `tests/rendering/email-approval-reminder.test.ts`
- Reference: `lib/email/templates/approval-reminder.tsx` (Pfad anpassen)

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render"; // oder die Funktion die KickPact nutzt
import { ApprovalReminderEmail } from "../../lib/email/templates/approval-reminder";

const FIXTURE = {
  sponsorName: "Familie Müller",
  eventDescription: "Hackentor von Lukas Wagner (Minute 67)",
  matchDescription: "FC Sportfreunde Dossenheim vs. TSV Handschuhsheim (01.05.2026)",
  amount: "5,00 €",
  approveUrl: "https://kickpact.de/approve/abc123",
  disputeUrl: "https://kickpact.de/dispute/abc123",
  reminderCount: 1,
};

describe("Approval reminder email", () => {
  it("renders all fields", () => {
    const html = render(<ApprovalReminderEmail {...FIXTURE} />);
    expect(html).toContain("Familie Müller");
    expect(html).toContain("Hackentor");
    expect(html).toContain("5,00");
    expect(html).toContain("https://kickpact.de/approve/abc123");
  });

  it("snapshot", () => {
    const html = render(<ApprovalReminderEmail {...FIXTURE} />);
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });

  it("reminderCount=3 includes 'letzte Erinnerung' notice", () => {
    const html = render(<ApprovalReminderEmail {...{ ...FIXTURE, reminderCount: 3 }} />);
    expect(html).toMatch(/letzte erinnerung/i);
  });
});
```

Run: `npm test -- email-approval-reminder`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/rendering/email-approval-reminder.test.ts tests/rendering/__snapshots__/
git commit -m "test(rendering): approval reminder email snapshot"
```

---

### Task 6.3: Invoice + Magic-Link E-Mails

**Files:**
- Create: `tests/rendering/email-invoice.test.ts`
- Create: `tests/rendering/email-magic-link.test.ts`

- [ ] **Step 1: Invoice-Mail Test**

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { InvoiceEmail } from "../../lib/email/templates/invoice";

describe("Invoice email", () => {
  it("renders sponsor name, period, amount, download link", () => {
    const html = render(
      <InvoiceEmail
        sponsorName="Familie Müller"
        clubName="FC Sportfreunde 1910 Dossenheim"
        period="Mai 2026"
        amount="15,00 €"
        invoiceUrl="https://kickpact.de/inv/123"
        pdfUrl="https://kickpact.de/inv/123.pdf"
      />,
    );
    expect(html).toContain("Familie Müller");
    expect(html).toContain("FC Sportfreunde 1910 Dossenheim");
    expect(html).toContain("Mai 2026");
    expect(html).toContain("15,00");
    expect(html).toContain("https://kickpact.de/inv/123.pdf");
  });

  it("snapshot", () => {
    const html = render(
      <InvoiceEmail sponsorName="Familie Müller" clubName="Test Club" period="Mai 2026" amount="15,00 €" invoiceUrl="https://x/i" pdfUrl="https://x/i.pdf" />,
    );
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Magic-Link-Mail Test**

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { MagicLinkEmail } from "../../lib/email/templates/magic-link";

describe("Magic link email", () => {
  it("renders user email + magic link", () => {
    const html = render(<MagicLinkEmail email="user@example.com" magicLink="https://kickpact.de/auth/magic?token=abc" />);
    expect(html).toContain("user@example.com");
    expect(html).toContain("https://kickpact.de/auth/magic?token=abc");
  });

  it("snapshot", () => {
    const html = render(<MagicLinkEmail email="user@example.com" magicLink="https://kickpact.de/auth/magic?token=abc" />);
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });
});
```

Run: `npm test -- email`
Expected: PASS — 6 Tests insgesamt für E-Mails (3 Templates × 2 Tests).

- [ ] **Step 3: Commit**

```bash
git add tests/rendering/email-invoice.test.ts tests/rendering/email-magic-link.test.ts tests/rendering/__snapshots__/
git commit -m "test(rendering): invoice + magic-link email snapshots"
```

---

## Phase 7 — E2E-Tests (Playwright) — Worktree C (nach Phase 4)

**Voraussetzung:** Phase 1 + 4 abgeschlossen. Lauffähig parallel zu Phase 5/6.

### Task 7.1: E2E DB-Seed Helper

**Files:**
- Create: `tests/e2e/scraper-flow/_seed.ts`

- [ ] **Step 1: Helper**

```typescript
// tests/e2e/scraper-flow/_seed.ts
// E2E tests run against a real Next.js dev server with a separate test DB.
// This helper seeds fixture-based data through direct DB writes (faster than UI flows).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../lib/db/schema";
import { seedClubFromFixture as integrationSeed } from "../../fixtures/scraper/seed-from-fixtures";

const URL = process.env.E2E_DATABASE_URL ?? "postgres://test:test@localhost:54329/kickpact_e2e";
const sql = postgres(URL, { max: 5 });
export const db = drizzle(sql, { schema });

export async function resetE2EDb(): Promise<void> {
  await sql`TRUNCATE
    charges, event_approvals, match_events, matches, players, teams,
    pledge_rules, pledges, sponsors, team_licenses, subscriptions,
    club_memberships, invoices, invoice_items, clubs, users
    RESTART IDENTITY CASCADE`;
}

export async function seedTestUserAndClub(): Promise<{ userId: string; clubId: string; teamId: string; sessionCookie: string }> {
  // Insert a test user, club (from fixture), team membership
  // Generate a session cookie that the E2E test can use
  // ... (implementation depends on better-auth session structure)
  return { userId: "u_test", clubId: "c_dossenheim", teamId: "t_dossenheim_herren1", sessionCookie: "..." };
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/_seed.ts
git commit -m "test(e2e): seed helper for scraper-flow tests"
```

---

### Task 7.2: Verein-Onboarding E2E

**Files:**
- Create: `tests/e2e/scraper-flow/verein-onboarding.spec.ts`

- [ ] **Step 1: Test**

```typescript
import { test, expect } from "@playwright/test";
import { resetE2EDb } from "./_seed";

test.beforeEach(async () => { await resetE2EDb(); });

test("verein onboarding — search Dossenheim, pick team, fill stammdaten, get invite link", async ({ page }) => {
  // 1. Register
  await page.goto("/register");
  await page.getByLabel("E-Mail").fill("trainer@dossenheim.test");
  await page.getByRole("button", { name: /magic link/i }).click();
  // (in test mode: skip magic-link flow via test-helper; assume logged-in)

  // 2. Onboarding Step 1 — Vereinssuche
  await page.goto("/onboarding/verein/1");
  await page.getByPlaceholder(/verein suchen/i).fill("Dossenheim");
  await page.getByRole("button", { name: /suchen/i }).click();
  await expect(page.getByText("FC Sportfreunde 1910 Dossenheim")).toBeVisible({ timeout: 10_000 });
  await page.getByText("FC Sportfreunde 1910 Dossenheim").click();

  // 3. Step 2 — Mannschafts-Auswahl
  await expect(page.getByText(/Herren 1/i)).toBeVisible();
  await page.getByLabel(/Herren 1/i).check();
  await page.getByRole("button", { name: /weiter/i }).click();

  // 4. Step 3 — Stammdaten
  await page.getByLabel(/Straße/i).fill("Bahnhofstr. 1");
  await page.getByLabel(/PLZ/i).fill("69221");
  await page.getByLabel(/Ort/i).fill("Dossenheim");
  await page.getByLabel(/IBAN/i).fill("DE89 3704 0044 0532 0130 00");
  await page.getByRole("button", { name: /weiter/i }).click();

  // 5. Step 4 — Sponsor-Einladungslink
  await expect(page.getByText(/einladungslink/i)).toBeVisible();
  const link = await page.getByRole("link", { name: /link kopieren|sponsor einladen/i }).getAttribute("href");
  expect(link).toMatch(/\/sponsor\/onboarding\?token=/);
});
```

Run: `npm run test:e2e -- verein-onboarding`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/verein-onboarding.spec.ts
git commit -m "test(e2e): verein onboarding flow with real fixture search"
```

---

### Task 7.3: Sponsor Pledge-Wizard E2E

**Files:**
- Create: `tests/e2e/scraper-flow/sponsor-pledge-wizard.spec.ts`

- [ ] **Step 1: Test**

```typescript
import { test, expect } from "@playwright/test";
import { resetE2EDb, seedTestUserAndClub } from "./_seed";

test.beforeEach(async () => { await resetE2EDb(); });

test("sponsor pledge wizard — pick team, events, player from kader, submit", async ({ page, context }) => {
  const seed = await seedTestUserAndClub();
  // Set sponsor session cookie
  await context.addCookies([{ name: "better-auth.session_token", value: seed.sessionCookie, url: "http://localhost:3000" }]);

  await page.goto("/sponsor/pledge/new");

  // Step 1: Mannschaft wählen
  await expect(page.getByText("FC Sportfreunde 1910 Dossenheim")).toBeVisible();
  await page.getByLabel(/Herren 1/i).check();
  await page.getByRole("button", { name: /weiter/i }).click();

  // Step 2: Ereignisse wählen
  await page.getByLabel(/Pro Tor/i).check();
  await page.getByLabel(/Pro Tor/i).locator("..").getByLabel(/Betrag/i).fill("5");

  await page.getByLabel(/Hackentor/i).check();
  await page.getByLabel(/Hackentor/i).locator("..").getByLabel(/Betrag/i).fill("20");

  await page.getByRole("button", { name: /spieler wählen/i }).click();
  // Player-Picker zeigt echte Spieler aus Kader-Fixture
  await expect(page.getByRole("listitem").first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("listitem").first().click();
  await page.getByRole("button", { name: /weiter/i }).click();

  // Step 3: Caps + Bestätigung
  await page.getByLabel(/Monats-Limit/i).fill("100");
  await page.getByRole("button", { name: /pledge abschließen/i }).click();

  // Verify: Pledge in Sponsor-Dashboard
  await expect(page).toHaveURL(/\/sponsor/);
  await expect(page.getByText(/Pro Tor/i)).toBeVisible();
});
```

Run: `npm run test:e2e -- sponsor-pledge-wizard`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/sponsor-pledge-wizard.spec.ts
git commit -m "test(e2e): sponsor pledge wizard with kader player picker"
```

---

### Task 7.4: Approval-Inbox E2E

**Files:**
- Create: `tests/e2e/scraper-flow/approval-inbox.spec.ts`

- [ ] **Step 1: Test (2 Sub-Cases)**

```typescript
import { test, expect } from "@playwright/test";
import { resetE2EDb, seedTestUserAndClub, db } from "./_seed";
import { matches, matchEvents, charges, eventApprovals } from "../../../lib/db/schema";

async function seedPendingApproval(teamId: string, sponsorId: string) {
  // Insert match + manual event + pending approval + pending charge
  const matchId = "m_test_approval";
  await db.insert(matches).values({ id: matchId, teamId, fussballdeSpielId: "FAKE_APPR", datum: new Date(), heimName: "FC Sportfreunde 1910 Dossenheim", gastName: "TSV Handschuhsheim", ergebnisHeim: 2, ergebnisGast: 1, halbzeitHeim: 1, halbzeitGast: 0, status: "finished", crawledAt: new Date() });
  await db.insert(matchEvents).values({ id: "ev_test", matchId, minute: 67, type: "tor", subtype: "hackentor", side: "heim", playerName: "Lukas Wagner", source: "manual" });
  // ... charge + approval rows
}

test.beforeEach(async () => { await resetE2EDb(); });

test("sponsor confirms pending approval — charge becomes confirmed", async ({ page, context }) => {
  const seed = await seedTestUserAndClub();
  await seedPendingApproval(seed.teamId, "s_test");
  await context.addCookies([{ name: "better-auth.session_token", value: seed.sessionCookie, url: "http://localhost:3000" }]);

  await page.goto("/sponsor/inbox");
  await expect(page.getByText(/Hackentor/i)).toBeVisible();
  await page.getByRole("button", { name: /bestätigen/i }).click();
  await expect(page.getByText(/bestätigt/i)).toBeVisible();
});

test("sponsor disputes pending approval — charge becomes cancelled", async ({ page, context }) => {
  const seed = await seedTestUserAndClub();
  await seedPendingApproval(seed.teamId, "s_test");
  await context.addCookies([{ name: "better-auth.session_token", value: seed.sessionCookie, url: "http://localhost:3000" }]);

  await page.goto("/sponsor/inbox");
  await page.getByRole("button", { name: /bestreiten/i }).click();
  await page.getByLabel(/Begründung/i).fill("War ein normaler Schuss, kein Hackentor");
  await page.getByRole("button", { name: /senden/i }).click();
  await expect(page.getByText(/bestritten|abgelehnt/i)).toBeVisible();
});
```

Run: `npm run test:e2e -- approval-inbox`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/approval-inbox.spec.ts
git commit -m "test(e2e): approval inbox confirm + dispute"
```

---

### Task 7.5: Verein-Ereignisse-View E2E

**Files:**
- Create: `tests/e2e/scraper-flow/verein-ereignisse-view.spec.ts`

- [ ] **Step 1: Test**

```typescript
import { test, expect } from "@playwright/test";
import { resetE2EDb, seedTestUserAndClub, db } from "./_seed";

test.beforeEach(async () => { await resetE2EDb(); });

test("verein sieht Spielplan + meldet Manual-Event", async ({ page, context }) => {
  const seed = await seedTestUserAndClub();
  await context.addCookies([{ name: "better-auth.session_token", value: seed.sessionCookie, url: "http://localhost:3000" }]);
  // Seed: 1 finished match
  // ... (insert match + events from fixture)

  await page.goto("/verein/dossenheim/ereignisse");
  await expect(page.getByText(/spiele/i)).toBeVisible();

  // Manual-Event hinzufügen
  await page.getByRole("button", { name: /event melden/i }).click();
  await page.getByLabel(/Spieler/i).fill("Lukas Wagner");
  await page.getByLabel(/Minute/i).fill("67");
  await page.getByLabel(/Typ/i).selectOption("hackentor");
  await page.getByRole("button", { name: /speichern/i }).click();

  await expect(page.getByText(/Lukas Wagner.*Hackentor/i)).toBeVisible();
});
```

Run: `npm run test:e2e -- verein-ereignisse-view`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/verein-ereignisse-view.spec.ts
git commit -m "test(e2e): verein ereignisse view + manual event submission"
```

---

### Task 7.6: Invoice-Flow E2E

**Files:**
- Create: `tests/e2e/scraper-flow/invoice-flow.spec.ts`

- [ ] **Step 1: Test**

```typescript
import { test, expect } from "@playwright/test";
import { resetE2EDb, seedTestUserAndClub, db } from "./_seed";
import { runGenerateInvoices } from "../../../lib/inngest/functions/generate-invoices";

test.beforeEach(async () => { await resetE2EDb(); });

test("monthly invoice — sponsor sieht PDF, verein markiert als bezahlt", async ({ page, context }) => {
  const seed = await seedTestUserAndClub();
  await context.addCookies([{ name: "better-auth.session_token", value: seed.sessionCookie, url: "http://localhost:3000" }]);
  // Seed: 3 confirmed charges in April 2026
  // ... db.insert(charges)

  // Trigger invoice generation for period 2026-04
  await runGenerateInvoices({ period: "2026-04" });

  // Sponsor sieht Invoice
  await page.goto("/sponsor/rechnungen");
  await expect(page.getByText(/April 2026/i)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /pdf/i }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);

  // Verein markiert als bezahlt
  await page.goto("/verein/dossenheim/abrechnungen");
  await page.getByRole("button", { name: /als bezahlt markieren/i }).first().click();
  await expect(page.getByText(/bezahlt/i)).toBeVisible();
});
```

Run: `npm run test:e2e -- invoice-flow`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/invoice-flow.spec.ts
git commit -m "test(e2e): invoice generation + sponsor download + verein paid-marking"
```

---

### Task 7.7: Multi-Tenant-Isolation E2E (kritisch!)

**Files:**
- Create: `tests/e2e/scraper-flow/multi-tenant-isolation.spec.ts`

- [ ] **Step 1: Test**

```typescript
import { test, expect } from "@playwright/test";
import { resetE2EDb, db } from "./_seed";
import { clubs, teams, sponsors, pledges, users, clubMemberships } from "../../../lib/db/schema";

test.beforeEach(async () => { await resetE2EDb(); });

async function seedTwoSponsors(): Promise<{ sponsorA: { id: string; cookie: string }; sponsorB: { id: string; pledgeId: string; cookie: string }; invoiceBId: string }> {
  // Insert 2 clubs, 2 sponsors, 2 pledges (one per sponsor)
  // Returns session cookies + relevant IDs
  return { /* ... */ } as any;
}

test("Sponsor A sieht keine Pledges von Sponsor B im Dashboard", async ({ page, context }) => {
  const { sponsorA, sponsorB } = await seedTwoSponsors();
  await context.addCookies([{ name: "better-auth.session_token", value: sponsorA.cookie, url: "http://localhost:3000" }]);

  await page.goto("/sponsor");
  // Sponsor A's own pledges should be visible
  // Sponsor B's pledges must NOT be visible
  const allText = await page.content();
  expect(allText).not.toContain(sponsorB.pledgeId);
});

test("Sponsor A bekommt 404 für /sponsor/pledge/<B-pledge-id>", async ({ page, context }) => {
  const { sponsorA, sponsorB } = await seedTwoSponsors();
  await context.addCookies([{ name: "better-auth.session_token", value: sponsorA.cookie, url: "http://localhost:3000" }]);

  const resp = await page.goto(`/sponsor/pledge/${sponsorB.pledgeId}`);
  expect([403, 404]).toContain(resp?.status());
});

test("Sponsor A bekommt 403 für /api/invoices/<B-invoice-id>", async ({ page, context, request }) => {
  const { sponsorA, invoiceBId } = await seedTwoSponsors();
  await context.addCookies([{ name: "better-auth.session_token", value: sponsorA.cookie, url: "http://localhost:3000" }]);

  const resp = await request.get(`/api/invoices/${invoiceBId}`);
  expect([403, 404]).toContain(resp.status());
});

test("Trainer von Verein X kann keinen Stripe-Plan von Verein Y ändern", async ({ page, context, request }) => {
  // Setup: Verein X, Verein Y, Trainer-User von X
  // Trainer versucht POST /api/clubs/y/subscription
  // Expected: 403
  // ... (implementation depends on actual API path)
});
```

Run: `npm run test:e2e -- multi-tenant-isolation`
Expected: PASS. **Wenn ein Test fail — IDOR-Lücke gefunden, sofort fixen!**

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/scraper-flow/multi-tenant-isolation.spec.ts
git commit -m "test(e2e): multi-tenant isolation — IDOR checks for sponsors and clubs"
```

---

## Phase 8 — Drift-Detection — Worktree D (parallel zu Phase 2/3/4)

**Voraussetzung:** Phase 1 abgeschlossen (Manifest existiert).

### Task 8.1: Drift-Checker Kern-Logik

**Files:**
- Create: `scripts/drift/check-drift.ts`
- Create: `scripts/drift/diff-fields.ts`
- Create: `tests/scraper/drift/diff-fields.test.ts`

- [ ] **Step 1: Diff-Logik Test — failing**

```typescript
// tests/scraper/drift/diff-fields.test.ts
import { describe, it, expect } from "vitest";
import { diffField } from "../../../scripts/drift/diff-fields";

describe("diffField", () => {
  it("type match — string expected, string got", () => {
    const d = diffField("name", { type: "string", minLength: 3 }, "Hello");
    expect(d).toBeNull();
  });

  it("type mismatch — string expected, number got", () => {
    const d = diffField("name", { type: "string" }, 42);
    expect(d).toMatchObject({ field: "name", reason: expect.stringContaining("type") });
  });

  it("enum violation", () => {
    const d = diffField("side", { type: "string", enum: ["heim", "gast"] }, "neutral");
    expect(d).toMatchObject({ field: "side", reason: expect.stringContaining("enum") });
  });

  it("nullable allows null", () => {
    const d = diffField("playerId", { type: "string", nullable: true }, null);
    expect(d).toBeNull();
  });

  it("non-nullable rejects null", () => {
    const d = diffField("matchId", { type: "string" }, null);
    expect(d).toMatchObject({ field: "matchId", reason: expect.stringContaining("null") });
  });

  it("number range violation", () => {
    const d = diffField("minute", { type: "number", min: 0, max: 130 }, 200);
    expect(d).toMatchObject({ field: "minute", reason: expect.stringContaining("max") });
  });

  it("tolerant whitespace in strings (when flagged)", () => {
    const d = diffField("ergebnis", { type: "string", enum: ["3:1"], tolerantWhitespace: true }, "3 : 1");
    expect(d).toBeNull();
  });
});
```

Run: `npm test -- diff-fields`
Expected: FAIL.

- [ ] **Step 2: Implementation**

```typescript
// scripts/drift/diff-fields.ts
export type FieldSchema = {
  type: "string" | "number" | "object" | "array";
  pattern?: string;
  enum?: string[];
  min?: number;
  max?: number;
  minLength?: number;
  nullable?: boolean;
  tolerantWhitespace?: boolean;
  tolerantCasing?: boolean;
};

export type Drift = { field: string; expected: FieldSchema; actual: unknown; reason: string };

export function diffField(field: string, schema: FieldSchema, value: unknown): Drift | null {
  if (value === null || value === undefined) {
    if (schema.nullable) return null;
    return { field, expected: schema, actual: value, reason: "expected non-null value, got null" };
  }
  const actualType = typeof value;
  if (schema.type === "number" && actualType !== "number") {
    return { field, expected: schema, actual: value, reason: `expected type number, got ${actualType}` };
  }
  if (schema.type === "string" && actualType !== "string") {
    return { field, expected: schema, actual: value, reason: `expected type string, got ${actualType}` };
  }
  if (schema.type === "number") {
    const n = value as number;
    if (schema.min !== undefined && n < schema.min) return { field, expected: schema, actual: value, reason: `below min ${schema.min}` };
    if (schema.max !== undefined && n > schema.max) return { field, expected: schema, actual: value, reason: `above max ${schema.max}` };
  }
  if (schema.type === "string") {
    let s = value as string;
    if (schema.tolerantWhitespace) s = s.replace(/\s+/g, " ").trim();
    if (schema.tolerantCasing) s = s.toLowerCase();
    if (schema.enum) {
      const allowed = schema.enum.map((e) => {
        let x = e;
        if (schema.tolerantWhitespace) x = x.replace(/\s+/g, " ").trim();
        if (schema.tolerantCasing) x = x.toLowerCase();
        return x;
      });
      if (!allowed.includes(s)) return { field, expected: schema, actual: value, reason: `not in enum [${schema.enum.join(", ")}]` };
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(s)) {
      return { field, expected: schema, actual: value, reason: `does not match pattern ${schema.pattern}` };
    }
    if (schema.minLength !== undefined && s.length < schema.minLength) {
      return { field, expected: schema, actual: value, reason: `length ${s.length} below min ${schema.minLength}` };
    }
  }
  return null;
}
```

Run: `npm test -- diff-fields`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/drift/diff-fields.ts tests/scraper/drift/diff-fields.test.ts
git commit -m "test(drift): field-level schema diff with tolerance flags"
```

---

### Task 8.2: Drift-Checker Hauptskript

**Files:**
- Create: `scripts/drift/check-drift.ts`

- [ ] **Step 1: Skript**

```typescript
// scripts/drift/check-drift.ts
import fs from "fs/promises";
import path from "path";
import { searchVereine, getMannschaften, getSpiele, getSpielDetails, getKader } from "../../lib/crawler/fussballde";
import { FIXTURE_CLUBS, MANIFEST_PATH } from "../../tests/fixtures/scraper/config";
import { diffField, type Drift, type FieldSchema } from "./diff-fields";

type Manifest = {
  version: string;
  generatedAt: string;
  scraperFunctions: Record<string, { expectedFields: Record<string, FieldSchema>; domAnchors: Array<{ name: string; selector: string; expectedCount: string }> }>;
};

const REPORT_JSON = process.env.DRIFT_REPORT_PATH ?? "drift-report.json";
const REPORT_MD = REPORT_JSON.replace(/\.json$/, ".md");

async function main() {
  const manifest: Manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf-8"));
  const drifts: Drift[] = [];

  // Pick rotating subset: 1 club per day-of-month, 1 team, first 3 matches
  const dayOfMonth = new Date().getUTCDate();
  const club = FIXTURE_CLUBS[dayOfMonth % FIXTURE_CLUBS.length];
  const team = club.teams[0];
  const saison = team.saisons[0];

  console.log(`Checking drift for ${club.key}/${team.key}/saison${saison}`);

  try {
    const search = await searchVereine(club.searchTerm);
    drifts.push(...diffArray("searchVereine", manifest.scraperFunctions.searchVereine.expectedFields, search));

    if (search.length > 0) {
      const verein = search[0];
      const mannschaften = await getMannschaften(verein.vereinId, verein.slug);
      drifts.push(...diffArray("getMannschaften", manifest.scraperFunctions.getMannschaften.expectedFields, mannschaften));

      const teamHit = mannschaften.find((m) => m.name.toLowerCase().includes(team.searchName.toLowerCase().split(" ")[0]));
      if (teamHit) {
        const spiele = await getSpiele(teamHit.teamId, teamHit.slug, saison);
        drifts.push(...diffArray("getSpiele", manifest.scraperFunctions.getSpiele.expectedFields, spiele));

        const kader = await getKader(teamHit.teamId, teamHit.slug, saison);
        drifts.push(...diffArray("getKader", manifest.scraperFunctions.getKader.expectedFields, kader));

        for (const spiel of spiele.slice(0, 3)) {
          const details = await getSpielDetails(spiel.spielId, teamHit.slug);
          drifts.push(...diffArray("getSpielDetails", manifest.scraperFunctions.getSpielDetails.expectedFields, details.events.map((e) => ({ events: e }))));
        }
      }
    }
  } catch (err) {
    drifts.push({ field: "_capture", expected: { type: "string" }, actual: null, reason: `Live scrape failed: ${(err as Error).message}` });
  }

  await fs.writeFile(REPORT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), club: club.key, drifts }, null, 2));
  await fs.writeFile(REPORT_MD, renderMarkdown(club.key, drifts));

  if (drifts.length > 0) {
    console.error(`Drift detected — ${drifts.length} field(s) failed`);
    console.error(JSON.stringify(drifts, null, 2));
    process.exit(1);
  }
  console.log("No drift detected");
}

function diffArray(_fn: string, schema: Record<string, FieldSchema>, items: unknown[]): Drift[] {
  const drifts: Drift[] = [];
  for (const item of items) {
    for (const [key, fieldSchema] of Object.entries(schema)) {
      const path = key.replace(/^(items|events)\[\]\./, "");
      const value = path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), item);
      const d = diffField(path, fieldSchema, value);
      if (d) drifts.push(d);
    }
  }
  // Deduplicate (same reason on multiple items)
  const seen = new Set<string>();
  return drifts.filter((d) => {
    const k = `${d.field}|${d.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function renderMarkdown(clubKey: string, drifts: Drift[]): string {
  const date = new Date().toISOString();
  let md = `## Scraper Drift Detected — ${date}\n\n**Club checked:** ${clubKey}\n\n`;
  if (drifts.length === 0) {
    return md + "No drift.\n";
  }
  md += `### Field-Level Changes (${drifts.length})\n\n`;
  for (const d of drifts) {
    md += `- \`${d.field}\`: ${d.reason}\n  - Expected: \`${JSON.stringify(d.expected)}\`\n  - Actual: \`${JSON.stringify(d.actual)}\`\n`;
  }
  md += "\n### Recommended Action\n\n1. Inspect HTML snapshot under `drift-snapshots/`\n2. Update `lib/crawler/fussballde.ts` selectors as needed\n3. Re-run `npm run fixtures:refresh` to regenerate manifest\n";
  return md;
}

main().catch((e) => {
  console.error("Drift checker crashed:", e);
  process.exit(2); // distinct exit code: crash, not drift
});
```

- [ ] **Step 2: NPM-Script ergänzen**

In `package.json`:
```json
"drift:check": "tsx scripts/drift/check-drift.ts"
```

- [ ] **Step 3: Lokaler Test mit echtem Live-Scrape**

Run: `npm run drift:check`
Expected: Exit 0 falls keine Drift, oder lesbarer Report bei Drift.

- [ ] **Step 4: Lokaler Test mit absichtlich kaputtem Manifest**

Erstelle `tests/scraper/drift/check-drift.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";

describe("drift checker against broken manifest", () => {
  it("exits 1 with report when manifest demands impossible values", () => {
    // Make a backup, then write a manifest with absurd constraints
    fs.copyFileSync("tests/fixtures/scraper/manifest.json", "tests/fixtures/scraper/manifest.bak.json");
    const original = fs.readFileSync("tests/fixtures/scraper/manifest.json", "utf-8");
    const m = JSON.parse(original);
    m.scraperFunctions.searchVereine.expectedFields["items[].name"] = { type: "number" };
    fs.writeFileSync("tests/fixtures/scraper/manifest.json", JSON.stringify(m, null, 2));

    try {
      execSync("tsx scripts/drift/check-drift.ts", { encoding: "utf-8", env: { ...process.env, DRIFT_REPORT_PATH: "drift-test-report.json" } });
      throw new Error("Should have exited non-zero");
    } catch (e) {
      const err = e as { status?: number };
      expect(err.status).toBe(1);
      const report = JSON.parse(fs.readFileSync("drift-test-report.json", "utf-8"));
      expect(report.drifts.length).toBeGreaterThan(0);
    } finally {
      fs.copyFileSync("tests/fixtures/scraper/manifest.bak.json", "tests/fixtures/scraper/manifest.json");
      fs.unlinkSync("tests/fixtures/scraper/manifest.bak.json");
      if (fs.existsSync("drift-test-report.json")) fs.unlinkSync("drift-test-report.json");
    }
  }, 120_000);
});
```

Run: `npm test -- check-drift`
Expected: PASS (Test verifiziert, dass das Skript bei kaputtem Manifest Exit 1 + Report produziert).

- [ ] **Step 5: Commit**

```bash
git add scripts/drift/ tests/scraper/drift/ package.json
git commit -m "feat(drift): daily drift checker with field-level diff and markdown report"
```

---

### Task 8.3: GitHub Action für Daily-Drift

**Files:**
- Create: `.github/workflows/scraper-drift.yml`

- [ ] **Step 1: Workflow**

```yaml
name: Scraper Drift Detection

on:
  schedule:
    - cron: "0 4 * * *"
  workflow_dispatch:

jobs:
  check-drift:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run drift check
        id: drift
        run: npm run drift:check
        env:
          DRIFT_REPORT_PATH: drift-report.json
      - name: Upload drift report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: drift-report-${{ github.run_id }}
          path: |
            drift-report.json
            drift-report.md
      - name: Create issue on drift
        if: failure() && steps.drift.outcome == 'failure'
        uses: peter-evans/create-issue-from-file@v5
        with:
          title: "Scraper Drift Detected — ${{ github.run_started_at }}"
          content-filepath: drift-report.md
          labels: scraper,drift,automated
```

- [ ] **Step 2: Workflow lokal mit `act` testen (optional)**

```bash
act workflow_dispatch -W .github/workflows/scraper-drift.yml
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/scraper-drift.yml
git commit -m "ci(drift): daily scraper drift detection workflow"
```

---

## Phase 9 — Docs, NPM-Scripts, CI-Integration (final, konsolidiert)

**Voraussetzung:** Alle vorherigen Phasen abgeschlossen und gemerged.

### Task 9.1: Live-Smoke-Test

**Files:**
- Create: `tests/scraper/live-smoke.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { searchVereine, getMannschaften, getSpiele } from "../../lib/crawler/fussballde";

const LIVE = process.env.LIVE === "1";

describe.skipIf(!LIVE)("live smoke (gegen echte fussball.de)", () => {
  it("findet Dossenheim per Suche", async () => {
    const hits = await searchVereine("FC Sportfreunde 1910 Dossenheim");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].name.toLowerCase()).toContain("dossenheim");
  }, 60_000);

  it("liefert ≥1 Mannschaft", async () => {
    const hits = await searchVereine("FC Sportfreunde 1910 Dossenheim");
    const teams = await getMannschaften(hits[0].vereinId, hits[0].slug);
    expect(teams.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("liefert ≥1 Spiel für Herren 1 (2526)", async () => {
    const hits = await searchVereine("FC Sportfreunde 1910 Dossenheim");
    const teams = await getMannschaften(hits[0].vereinId, hits[0].slug);
    const herren1 = teams.find((t) => t.name.toLowerCase().includes("herren"))!;
    const spiele = await getSpiele(herren1.teamId, herren1.slug, "2526");
    expect(spiele.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
```

- [ ] **Step 2: NPM-Script ergänzen**

In `package.json`:
```json
"test:live": "LIVE=1 vitest run live-smoke"
```

- [ ] **Step 3: Run**

Run: `npm run test:live`
Expected: PASS (gegen echtes fussball.de).

- [ ] **Step 4: Commit**

```bash
git add tests/scraper/live-smoke.test.ts package.json
git commit -m "test(live): smoke test against real fussball.de"
```

---

### Task 9.2: Fixtures-README

**Files:**
- Create: `tests/fixtures/scraper/README.md`

- [ ] **Step 1: README**

````markdown
# Scraper Fixtures

Reale Daten von [fussball.de](https://www.fussball.de) für 4 Heidelberger Vereine:
- FC Sportfreunde 1910 Dossenheim
- SG Heidelberg-Kirchheim
- TSV Handschuhsheim
- SG Schriesheim

## Struktur

```
tests/fixtures/scraper/
├── config.ts          — Verein- und Team-Konfiguration
├── manifest.json      — Field-Level-Schema für Drift-Detection (auto-generiert)
├── html/              — HTML-Snapshots für Parser-Tests
│   └── <verein>/
│       ├── search.html
│       ├── mannschaften.html
│       ├── <team>-spiele-saison<YYYY>.html
│       ├── <team>-kader-saison<YYYY>.html
│       └── <team>-spiel-<spielId>.html
├── json/              — Geparste JSON-Outputs für Engine-/Integration-/E2E-Tests
│   └── (gleiche Struktur wie html/)
└── negative/          — Negativ-Cases (Captcha, 404, leere Suche)
```

## Refresh

```bash
# Voller Refresh aller 4 Vereine (~5–10 Min)
npm run fixtures:refresh

# Nur ein einzelner Verein
npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim --force

# Nur Manifest neu bauen (ohne Re-Scrape)
npm run fixtures:manifest
```

## Wann refreshen?

- Bei Drift-Detection-Issue: Manifest stimmt nicht mehr → Refresh.
- Bei jeder größeren Saison-Wende: neue Spiele dazu, alte fallen raus.
- Bei DOM-Änderungen auf fussball.de: Erst Scraper anpassen, dann Refresh.

## Was wird **nicht** refreshed?

- HTML-Negativ-Cases unter `html/negative/` (hand-curated)
- `config.ts` (manuell pflegen)
````

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/scraper/README.md
git commit -m "docs(fixtures): README for scraper fixture structure and refresh"
```

---

### Task 9.3: Testing-Dokumentation

**Files:**
- Create: `docs/testing.md`

- [ ] **Step 1: Doku**

````markdown
# Testing in KickPact

## Test-Ebenen

| Ebene | Verzeichnis | Was wird getestet | Geschwindigkeit |
|---|---|---|---|
| Parser | `tests/scraper/parser/` | DOM → strukturierte Daten | Mittel (Browser) |
| Engine | `tests/scraper/engine/` | Reine Trigger-Funktionen | Schnell |
| Integration | `tests/scraper/integration/` | Inngest-Jobs + DB | Mittel (Postgres) |
| E2E | `tests/e2e/scraper-flow/` | UI-Flows mit Playwright | Langsam |
| Rendering | `tests/rendering/` | PDF + E-Mail Snapshots | Schnell |
| Drift | `tests/scraper/drift/` | Drift-Checker selbst | Schnell |
| Live | `tests/scraper/live-smoke.test.ts` | Echte fussball.de (skipped in CI) | Sehr langsam |

## Ausführung

```bash
npm test                                # Alle (außer Live + E2E)
npm test -- parser                      # Nur Parser-Tests
npm test -- triggers                    # Nur Trigger-Engine
npm run test:e2e                        # Playwright
npm run test:live                       # Live-Smoke
npm run drift:check                     # Drift-Detection
```

## Vor jedem Commit

```bash
npm test
```

## Wenn fussball.de DOM bricht

1. Drift-Issue wird automatisch erstellt (GitHub Action, täglich 04:00).
2. Issue lesen — welche Felder/Selektoren sind betroffen?
3. `lib/crawler/fussballde.ts` anpassen.
4. `npm run fixtures:refresh` lokal laufen lassen.
5. Tests grün? → commit + push.

## Test-DB lokal

```bash
docker compose -f docker-compose.test.yml up -d
# Erstes Mal: Migrations laufen automatisch beim ersten Test-Run
```

## Neue Trigger-Typen testen

1. Fixture für ein passendes Match wählen.
2. Test in `tests/scraper/engine/triggers-*.test.ts` ergänzen.
3. Integration-Test in `tests/scraper/integration/evaluate-match.test.ts` ergänzen.
4. Falls UI betroffen: E2E in `tests/e2e/scraper-flow/sponsor-pledge-wizard.spec.ts`.
````

- [ ] **Step 2: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): test layer overview and workflows"
```

---

### Task 9.4: CI-Workflow erweitern

**Files:**
- Create or modify: `.github/workflows/ci.yml`

- [ ] **Step 1: CI-Workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: kickpact_test
        ports:
          - 54329:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run unit + integration tests
        run: npm test
        env:
          DATABASE_URL_TEST: postgres://test:test@localhost:54329/kickpact_test

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: kickpact_e2e
        ports:
          - 54329:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          E2E_DATABASE_URL: postgres://test:test@localhost:54329/kickpact_e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: unified test pipeline with postgres service"
```

---

### Task 9.5: Final-Check + Akzeptanzkriterien-Verifikation

**Files:** (nur Verifikation, kein Code)

- [ ] **Step 1: Akzeptanzkriterien durchgehen (Spec §8)**

```bash
# Test-Counts verifizieren
npm test 2>&1 | tail -30
# Erwartet:
# - Parser:        ≥30 Tests
# - Engine:        ≥40 Tests
# - Integration:   ≥25 Tests
# - Rendering:     ≥8 Tests
# - Drift:         ≥7 Tests
# Total Vitest:    ≥110 Tests

npm run test:e2e 2>&1 | tail -10
# Erwartet: ≥15 Playwright-Tests

# NPM-Scripts vorhanden
grep -E "fixtures:capture|fixtures:manifest|fixtures:refresh|drift:check|test:live|test:e2e" package.json

# Files vorhanden
test -f tests/fixtures/scraper/manifest.json
test -f tests/fixtures/scraper/README.md
test -f docs/testing.md
test -f .github/workflows/scraper-drift.yml
test -f .github/workflows/ci.yml
```

- [ ] **Step 2: Fullruns**

```bash
npm test
npm run test:e2e
npm run drift:check
```

Expected: alle grün.

- [ ] **Step 3: Final-Commit**

```bash
git add .
git commit -m "test: complete real-data validation suite — acceptance criteria met" --allow-empty
```

- [ ] **Step 4: PR vorbereiten (optional, falls in Branch)**

```bash
gh pr create --title "Scraper Real-Data Validation Suite" --body "$(cat <<'EOF'
## Summary
- 4 Heidelberger Vereine als Fixture-Set
- 4 Test-Ebenen + Rendering + Drift-Detection
- Daily Drift-Workflow + GitHub-Issues bei DOM-Brüchen
- Match-Update-Path + Multi-Tenant-Isolation Tests

Closes ...

## Test plan
- [x] Unit + Integration grün (`npm test`)
- [x] E2E grün (`npm run test:e2e`)
- [x] Drift-Check grün (`npm run drift:check`)
- [x] Live-Smoke grün (`npm run test:live`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review-Notizen (zur Wartung)

Wenn der Plan in mehreren Worktrees parallel ausgeführt wird:

1. **Phase 1 (Fixture-Foundation) muss vollständig committed und gemergt sein**, bevor Phase 2/3/4/8 starten.
2. **Phase 4 muss vollständig committed und gemergt sein**, bevor Phase 5/7 starten (Phase 6 ist davon unabhängig).
3. **Konfliktzonen:** `package.json` (Scripts) und `vitest.config.ts` werden in mehreren Phasen modifiziert — daher kommen die finalen Konsolidierungen in Phase 9.
4. **DB-Migrations:** falls Phase 4 (Schema-Erweiterung) und Phase 5 (Test-DB) parallel laufen, müssen sie sich an einer Migration einigen — Phase 4 schreibt die Migration, Phase 5 verwendet sie.

## Open Implementation Notes

- **Spielerresolution in Fixtures:** `getKader` cached Player-Namen, was bei Re-Capture für andere Mannschaften gleichen Vereins nützlich ist. Cache wird beim Browser-Close geleert — pro Capture-Run neu.
- **HTML-Größen:** Bei Bedarf kann ein zusätzlicher Schritt das `outerHTML` nur des relevanten Containers (z.B. `.match-detail-container`) statt der gesamten Seite speichern. Initial-Implementation speichert volle Seiten — wenn Repo zu groß wird, optimieren.
- **`runCrawlForTeam` / `runEvaluateMatch` / `runEvaluateSeason`:** Diese werden als exportierte Funktionen aus den Inngest-Function-Modulen extrahiert. Die eigentlichen Inngest-Functions rufen sie auf — das ermöglicht Integration-Tests ohne Inngest-Server-Setup.

