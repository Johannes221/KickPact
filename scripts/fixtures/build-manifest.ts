// scripts/fixtures/build-manifest.ts
import fs from "fs/promises";
import path from "path";
import {
  FIXTURE_CLUBS,
  JSON_ROOT,
  MANIFEST_PATH,
} from "../../tests/fixtures/scraper/config";

export type FieldSchema =
  | {
      type: "string";
      pattern?: string;
      minLength?: number;
      enum?: string[];
      nullable?: boolean;
    }
  | { type: "number"; min?: number; max?: number; nullable?: boolean }
  | { type: "object"; required?: string[]; nullable?: boolean }
  | { type: "array"; minLength?: number };

export function inferSchema(
  prefix: string,
  samples: unknown[],
): Record<string, FieldSchema> {
  const out: Record<string, FieldSchema> = {};
  if (samples.length === 0) return out;
  const flat = samples
    .flatMap((s) => (Array.isArray(s) ? s : [s]))
    .filter((v) => v !== undefined);

  const keys = new Set<string>();
  for (const sample of flat) {
    if (sample && typeof sample === "object") {
      for (const k of Object.keys(sample as object)) keys.add(k);
    }
  }
  for (const key of keys) {
    // Track BOTH "explicitly null" and "missing from object" — the latter
    // happens with union-typed records (e.g. spiel-event TOR vs AUSWECHSLUNG
    // have different field sets). Either case must mark the field nullable
    // so the drift checker does not flag a perfectly valid event-shape as
    // drift.
    const presentSamples = flat.filter(
      (s) => s && typeof s === "object" && key in (s as Record<string, unknown>),
    );
    const allValues = flat.map((s) => (s as Record<string, unknown>)[key]);
    const nonNull = allValues.filter((v) => v !== null && v !== undefined);
    const nullable =
      allValues.some((v) => v === null) || presentSamples.length < flat.length;
    if (nonNull.length === 0) continue;
    const types = new Set(nonNull.map((v) => typeof v));
    const fieldKey = `${prefix}.${key}`;
    if (types.size === 1 && types.has("number")) {
      const nums = nonNull as number[];
      out[fieldKey] = {
        type: "number",
        min: Math.min(...nums),
        max: Math.max(...nums),
        ...(nullable ? { nullable } : {}),
      };
    } else if (types.size === 1 && types.has("string")) {
      const strs = nonNull as string[];
      const unique = Array.from(new Set(strs));
      if (unique.length <= 5 && unique.every((s) => s.length < 30)) {
        out[fieldKey] = {
          type: "string",
          enum: unique,
          ...(nullable ? { nullable } : {}),
        };
      } else {
        // We intentionally use a conservative minLength=1 instead of the
        // observed minimum from the fixture set. Real-world fussball.de data
        // has far more variance than our 4-club fixture sample (e.g. opponent
        // names like "VFB Eppingen" are much shorter than our fixtures'
        // "Herren - FC Sportfreunde 1910 ..."). The minLength check exists to
        // catch the only signal that actually matters: empty strings caused by
        // a broken selector. Anything tighter is a false-positive magnet.
        out[fieldKey] = {
          type: "string",
          minLength: 1,
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

type ScraperFn =
  | "searchVereine"
  | "getMannschaften"
  | "getSpiele"
  | "getKader"
  | "getSpielDetails";

const DOM_ANCHORS: Record<ScraperFn, ManifestEntry["domAnchors"]> = {
  searchVereine: [
    {
      name: "search-result",
      selector: ".table-search-results a",
      expectedCount: "≥1",
    },
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
    {
      name: "event-tor",
      selector: "div[class*='icon-tor']",
      expectedCount: "≥0",
    },
    {
      name: "event-substitution",
      selector: "div[class*='icon-auswechslung']",
      expectedCount: "≥0",
    },
    {
      name: "halftime-row",
      selector: ".match-halftime, [data-halftime]",
      expectedCount: "≥0",
    },
  ],
};

async function loadFixturesFor(
  fn: ScraperFn,
): Promise<{ fixture: string; data: unknown }[]> {
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
        const data = JSON.parse(
          await fs.readFile(path.join(dir, f), "utf-8"),
        );
        out.push({ fixture: path.join(JSON_ROOT, club.key, f), data });
      }
    }
  }
  return out;
}

async function buildEntry(
  fn: ScraperFn,
): Promise<ManifestEntry & { function: ScraperFn }> {
  const fixtures = await loadFixturesFor(fn);
  const samples = fixtures.flatMap(({ data }) => {
    if (Array.isArray(data)) return data;
    if (fn === "getSpielDetails" && data && typeof data === "object") {
      const d = data as { events?: unknown[]; halbzeit?: unknown };
      return [
        {
          matchId: (data as { matchId?: unknown }).matchId,
          halbzeit: d.halbzeit,
        },
        ...((d.events as unknown[]) ?? []),
      ];
    }
    return [data];
  });
  const expectedFields = inferSchema(
    fn === "getSpielDetails" ? "events[]" : "items[]",
    samples,
  );
  return {
    function: fn,
    fixture: fixtures.map((f) => f.fixture).join(", "),
    expectedFields,
    domAnchors: DOM_ANCHORS[fn],
  };
}

export async function buildManifest(): Promise<void> {
  const fns: ScraperFn[] = [
    "searchVereine",
    "getMannschaften",
    "getSpiele",
    "getKader",
    "getSpielDetails",
  ];
  const scraperFunctions: Record<
    string,
    ManifestEntry & { function: ScraperFn }
  > = {};
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

// Run when invoked directly (works with tsx ESM since import.meta.url is provided)
const isMain = (() => {
  try {
    if (typeof require !== "undefined" && require.main === module) return true;
  } catch {
    /* esm */
  }
  if (typeof process !== "undefined" && process.argv[1]) {
    const p = process.argv[1];
    return (
      p.endsWith("build-manifest.ts") || p.endsWith("build-manifest.js")
    );
  }
  return false;
})();

if (isMain) {
  buildManifest().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
