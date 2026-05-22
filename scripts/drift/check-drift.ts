// scripts/drift/check-drift.ts
//
// Daily drift detector for the fussball.de scraper.
// Loads tests/fixtures/scraper/manifest.json, picks a rotating subset of clubs,
// hits the live site through the same scraper functions production uses, and
// diffs field-by-field against the manifest. On drift: writes JSON + Markdown
// reports and exits 1. On clean: exits 0.
//
// Pure helpers `diffArray` and `renderMarkdown` are exported for tests so the
// suite stays offline-safe.

import fs from "fs/promises";
import { fileURLToPath } from "url";
import {
  searchVereine,
  getMannschaften,
  getSpiele,
  getSpielDetails,
  getKader,
} from "../../lib/crawler/fussballde";
import { FIXTURE_CLUBS, MANIFEST_PATH } from "../../tests/fixtures/scraper/config";
import { diffField, type Drift, type FieldSchema } from "./diff-fields";

export type Manifest = {
  version: string;
  generatedAt: string;
  scraperFunctions: Record<
    string,
    {
      expectedFields: Record<string, FieldSchema>;
      domAnchors?: Array<{ name: string; selector: string; expectedCount: string }>;
    }
  >;
};

const REPORT_JSON = process.env.DRIFT_REPORT_PATH ?? "drift-report.json";
const REPORT_MD = REPORT_JSON.replace(/\.json$/, ".md");

export function diffArray(
  _fn: string,
  schema: Record<string, FieldSchema>,
  items: unknown[],
): Drift[] {
  const drifts: Drift[] = [];
  for (const item of items) {
    for (const [key, fieldSchema] of Object.entries(schema)) {
      const fieldPath = key.replace(/^(items|events)\[\]\./, "");
      const value = fieldPath
        .split(".")
        .reduce<unknown>(
          (acc, k) =>
            acc && typeof acc === "object"
              ? (acc as Record<string, unknown>)[k]
              : undefined,
          item,
        );
      const d = diffField(fieldPath, fieldSchema, value);
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

export function renderMarkdown(clubKey: string, drifts: Drift[]): string {
  const date = new Date().toISOString();
  let md = `## Scraper Drift Detected — ${date}\n\n**Club checked:** ${clubKey}\n\n`;
  if (drifts.length === 0) {
    return md + "No drift.\n";
  }
  md += `### Field-Level Changes (${drifts.length})\n\n`;
  for (const d of drifts) {
    md += `- \`${d.field}\`: ${d.reason}\n  - Expected: \`${JSON.stringify(d.expected)}\`\n  - Actual: \`${JSON.stringify(d.actual)}\`\n`;
  }
  md +=
    "\n### Recommended Action\n\n1. Inspect HTML snapshot under `drift-snapshots/`\n2. Update `lib/crawler/fussballde.ts` selectors as needed\n3. Re-run `npm run fixtures:refresh` to regenerate manifest\n";
  return md;
}

export async function main(): Promise<void> {
  const manifestRaw = await fs.readFile(MANIFEST_PATH, "utf-8");
  const manifest: Manifest = JSON.parse(manifestRaw);
  const drifts: Drift[] = [];

  // Rotating subset: 1 club per day-of-month, 1 team, first 3 matches.
  const dayOfMonth = new Date().getUTCDate();
  const club = FIXTURE_CLUBS[dayOfMonth % FIXTURE_CLUBS.length];
  const team = club.teams[0];
  const saison = team.saisons[0];

  console.log(`Checking drift for ${club.key}/${team.key}/saison${saison}`);

  try {
    const search = await searchVereine(club.searchTerm);
    const searchSchema = manifest.scraperFunctions.searchVereine?.expectedFields ?? {};
    drifts.push(...diffArray("searchVereine", searchSchema, search));

    if (search.length > 0) {
      const verein = search[0];
      const mannschaften = await getMannschaften(verein.vereinId, verein.slug);
      const mSchema = manifest.scraperFunctions.getMannschaften?.expectedFields ?? {};
      drifts.push(...diffArray("getMannschaften", mSchema, mannschaften));

      const teamHit = mannschaften.find((m) =>
        m.name
          .toLowerCase()
          .includes(team.searchName.toLowerCase().split(" ")[0]),
      );
      if (teamHit) {
        const spiele = await getSpiele(teamHit.teamId, teamHit.slug, saison);
        const sSchema = manifest.scraperFunctions.getSpiele?.expectedFields ?? {};
        drifts.push(...diffArray("getSpiele", sSchema, spiele));

        const kader = await getKader(teamHit.teamId, teamHit.slug, saison);
        const kSchema = manifest.scraperFunctions.getKader?.expectedFields ?? {};
        drifts.push(...diffArray("getKader", kSchema, kader));

        for (const spiel of spiele.slice(0, 3)) {
          const details = await getSpielDetails(spiel.spielId, teamHit.slug);
          const dSchema = manifest.scraperFunctions.getSpielDetails?.expectedFields ?? {};
          drifts.push(
            ...diffArray(
              "getSpielDetails",
              dSchema,
              details.events.map((e) => ({ events: e })),
            ),
          );
        }
      }
    }
  } catch (err) {
    drifts.push({
      field: "_capture",
      expected: { type: "string" },
      actual: null,
      reason: `Live scrape failed: ${(err as Error).message}`,
    });
  }

  await fs.writeFile(
    REPORT_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), club: club.key, drifts }, null, 2),
  );
  await fs.writeFile(REPORT_MD, renderMarkdown(club.key, drifts));

  if (drifts.length > 0) {
    console.error(`Drift detected — ${drifts.length} field(s) failed`);
    console.error(JSON.stringify(drifts, null, 2));
    process.exit(1);
  }
  console.log("No drift detected");
}

// Run only when invoked directly (not when imported by tests).
const isDirectInvocation =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectInvocation) {
  main().catch((e) => {
    console.error("Drift checker crashed:", e);
    process.exit(2); // distinct exit code: crash, not drift
  });
}
