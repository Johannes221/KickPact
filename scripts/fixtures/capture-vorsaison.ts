// scripts/fixtures/capture-vorsaison.ts
//
// Einmaliges Live-Capture der Vorsaison-Fixtures (ajax.team.matchplan) für die
// Fixture-Replay-Tests in tests/scraper/parser/vorsaison.test.ts.
//
// Pro Team/Saison werden aus DEMSELBEN Live-Lauf geschrieben:
//   - html/<club>/<teamKey>-matchplan-saison<YYYY>.json   (rohe JSON-Antwort)
//   - fonts/<obfuscationId>.ttf                           (Score-Font)
//   - json/<club>/<teamKey>-vorsaison-saison<YYYY>.json   ({teamId, saison, spiele})
//
// Höflichkeit: getVorsaisonSpiele macht 2 Requests (Matchplan + Font) mit
// ≥800ms Abstand; zwischen Team/Saison-Paaren pausiert das Script zusätzlich.
// Captcha → sofort harter Abbruch (bereits Geschriebenes bleibt gültig).
//
// Aufruf: npx tsx scripts/fixtures/capture-vorsaison.ts [--force]
import fs from "fs/promises";
import path from "path";
import { fetch as undiciFetch } from "undici";
import * as fontkit from "fontkit";
import {
  FIXTURES_ROOT,
  HTML_ROOT,
  JSON_ROOT,
} from "../../tests/fixtures/scraper/config";
import {
  getVorsaisonSpiele,
  parseVorsaisonSpiele,
  setMatchplanObserver,
} from "../../lib/crawler/vorsaison";
import type { ScoreFont, ScoreFontLoader } from "../../lib/crawler/score-font";
import type { MannschaftHit } from "../../lib/crawler/fussballde";

const FONTS_ROOT = `${FIXTURES_ROOT}/fonts`;
const FORCE = process.argv.includes("--force");
// --offline: KEINE Live-Requests — erwartete JSONs aus den bereits
// gecapturten Roh-Antworten + Fonts regenerieren (z.B. nach Parser-Fixes).
const OFFLINE = process.argv.includes("--offline");

/** Zielmenge: bewusst klein (2 Vereine, je Herren 1) — Captcha-Risiko minimal. */
const TARGETS: ReadonlyArray<{
  clubKey: string;
  teamKey: string;
  saisons: readonly string[];
}> = [
  { clubKey: "dossenheim", teamKey: "herren1", saisons: ["2425", "2526"] },
  { clubKey: "heidelberg-kirchheim", teamKey: "herren1", saisons: ["2425"] },
];

function abortOnCaptcha(err: unknown): void {
  if (err instanceof Error && /Captcha/i.test(err.message)) {
    console.error(`\n!! Captcha/Block erkannt — Capture abgebrochen: ${err.message}`);
    process.exit(2);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** "Herren 1" aus mannschaften.json: Kategorie "Herren", KEINE trailing Nummer. */
async function findHerren1(clubKey: string): Promise<MannschaftHit | null> {
  const raw = await fs.readFile(
    path.join(JSON_ROOT, clubKey, "mannschaften.json"),
    "utf-8",
  );
  const mannschaften = JSON.parse(raw) as MannschaftHit[];
  return (
    mannschaften.find(
      (m) => /^Herren\b/.test(m.name) && !/\d\s*$/.test(m.name.trim()),
    ) ?? null
  );
}

async function captureTeamSaison(
  clubKey: string,
  teamKey: string,
  team: MannschaftHit,
  saison: string,
): Promise<void> {
  const htmlRel = path.join(HTML_ROOT, clubKey, `${teamKey}-matchplan-saison${saison}.json`);
  const jsonRel = path.join(JSON_ROOT, clubKey, `${teamKey}-vorsaison-saison${saison}.json`);

  if (OFFLINE) {
    if (!(await exists(htmlRel))) {
      console.warn(`  ! ${clubKey}/${teamKey} saison${saison}: keine Roh-Fixture (offline)`);
      return;
    }
    const raw = JSON.parse(await fs.readFile(htmlRel, "utf-8")) as { html: string };
    const offlineLoader: ScoreFontLoader = async (id) => {
      const p = path.join(FONTS_ROOT, `${id}.ttf`);
      if (!(await exists(p))) return null;
      return fontkit.create(await fs.readFile(p)) as unknown as ScoreFont;
    };
    const spiele = await parseVorsaisonSpiele(raw.html, saison, {
      loadFont: offlineLoader,
    });
    await fs.writeFile(
      jsonRel,
      JSON.stringify({ teamId: team.teamId, saison, spiele }, null, 2),
      "utf-8",
    );
    console.log(`  ${clubKey}/${teamKey} saison${saison}: ${spiele.length} Spiele (offline regeneriert)`);
    return;
  }

  if (!FORCE && (await exists(htmlRel)) && (await exists(jsonRel))) {
    console.log(`  ${clubKey}/${teamKey} saison${saison}: cached`);
    return;
  }

  // Font-Loader, der die rohen TTF-Bytes desselben Laufs mitschreibt.
  const fontCache = new Map<string, Promise<ScoreFont | null>>();
  const capturingLoader: ScoreFontLoader = (id) => {
    let p = fontCache.get(id);
    if (!p) {
      p = (async () => {
        const res = await undiciFetch(
          `https://www.fussball.de/export.fontface/-/format/ttf/id/${id}/type/font`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "*/*",
            },
            redirect: "follow",
          },
        );
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) return null;
        await fs.mkdir(FONTS_ROOT, { recursive: true });
        await fs.writeFile(path.join(FONTS_ROOT, `${id}.ttf`), buf);
        console.log(`    font ${id}: ${buf.length}B`);
        return fontkit.create(buf) as unknown as ScoreFont;
      })();
      fontCache.set(id, p);
    }
    return p;
  };

  let rawBody: string | null = null;
  setMatchplanObserver((_url, body) => {
    rawBody = body;
  });
  try {
    // delayMs greift hier nicht (eigener Loader) → manuell zwischen Matchplan-
    // und Font-Request pausieren: der Loader wird erst beim ersten Score-Decode
    // aufgerufen, also NACH dem Matchplan-Fetch — sleep dort wäre pro Zeile.
    // Stattdessen: 800ms Pause ist im capturingLoader-Fetch nicht nötig, weil
    // pro Antwort nur EINE Obfuscation-ID existiert → genau 1 Font-Request.
    const spiele = await getVorsaisonSpiele(team.teamId, saison, {
      loadFont: capturingLoader,
    });
    if (rawBody === null) {
      console.warn(`  ! ${clubKey}/${teamKey} saison${saison}: kein Matchplan-Body beobachtet`);
      return;
    }
    await fs.mkdir(path.dirname(htmlRel), { recursive: true });
    await fs.writeFile(htmlRel, rawBody, "utf-8");
    await fs.mkdir(path.dirname(jsonRel), { recursive: true });
    await fs.writeFile(
      jsonRel,
      JSON.stringify({ teamId: team.teamId, saison, spiele }, null, 2),
      "utf-8",
    );
    console.log(`  ${clubKey}/${teamKey} saison${saison}: ${spiele.length} Spiele`);
  } catch (err) {
    abortOnCaptcha(err);
    console.warn(
      `  ! ${clubKey}/${teamKey} saison${saison} failed:`,
      (err as Error).message,
    );
  } finally {
    setMatchplanObserver(null);
  }
}

async function main() {
  for (const target of TARGETS) {
    const team = await findHerren1(target.clubKey);
    if (!team) {
      console.warn(`! kein Herren-1-Team in ${target.clubKey}/mannschaften.json`);
      continue;
    }
    console.log(`=== ${target.clubKey} → ${team.name} (${team.teamId})`);
    for (const saison of target.saisons) {
      await captureTeamSaison(target.clubKey, target.teamKey, team, saison);
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 400));
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
