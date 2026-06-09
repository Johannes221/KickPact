/**
 * SPIELBERICHT-COVERAGE-PROBE
 * ---------------------------------------------------------------------------
 * Frage: Bis zu welcher Altersklasse / in welcher Liga legt fussball.de
 * DETAILLIERTE Spielberichte an (benannte Torschützen-Events) — und wo gibt
 * es nur das Ergebnis bzw. gar keine Daten?
 *
 * Pro Mannschaft werden die jüngsten gespielten Spiele geprüft. Für jedes Spiel:
 *   - echter Score aus dem `.result`-Element der Detailseite ([H : G])
 *   - Anzahl benannter Tor-Events (hexagon.green + Spielerprofil-Link)
 * Daraus Klassifikation der Mannschaft:
 *   BERICHT     – mind. 1 Spiel mit benannten Torschützen
 *   NUR_ERGEBNIS– mehrere Spiele mit Toren, aber NIE benannte Torschützen
 *   KEINE_DATEN – keine Ergebnisse hinterlegt
 *   UNKLAR      – zu wenig aussagekräftige Spiele (nur 0:0 / Absagen)
 *
 * Reiner HTTP-Scrape gegen fussball.de — keine DB, kein Browser.
 * Run: npx tsx scripts/probe-spielbericht-coverage.ts
 */
import { fetch as undiciFetch } from "undici";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import {
  searchVereine,
  getMannschaften,
  getSpiele,
  type MannschaftHit,
} from "../lib/crawler/fussballde";

// ── Konfiguration ──────────────────────────────────────────────────────────
const SAISON = "2526";
const MAX_MATCHES_PER_TEAM = 4; // wie viele gespielte Spiele pro Team prüfen
const MAX_TEAMS_PER_CLUB = 25; // Strategie-B-Vereine liefern hunderte (inkl. Gegner)
const SAMPLE_PER_AGE = 14; // pro Altersklasse max. so viele Teams proben
const DETAIL_DELAY_MS = 300; // Höflichkeits-Delay zwischen Detail-Fetches
const TEAM_DELAY_MS = 250;

// Such-Begriffe für eine breite Vereins-Stichprobe (klein → groß, verschiedene
// Regionen/Spielklassen). searchVereine löst jeweils den ersten Treffer auf.
const CLUB_QUERIES = process.env.CLUBS
  ? process.env.CLUBS.split(";").map((s) => s.trim()).filter(Boolean)
  : [
      "FC Sportfreunde 1910 Dossenheim",
      "SV Waldhof Mannheim",
      "SV Sandhausen",
      "Karlsruher SC",
      "VfR Mannheim",
      "ASV Durlach",
      "FC Nöttingen",
      "TSG 1899 Hoffenheim",
      "SG Heidelberg-Kirchheim",
      "TSV Amicitia Viernheim",
      "FV Brühl",
      "SV Rohrbach",
      "TSV Reichenbach",
      "SpVgg Neckarelz",
      "FC Türkspor Mannheim",
    ];

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchDetail(spielId: string, slug: string) {
  const url = `https://www.fussball.de/spiel/${slug || "spiel"}/-/spiel/${spielId}`;
  const res = await undiciFetch(url, {
    headers: {
      "User-Agent": USER_AGENTS[spielId.charCodeAt(0) % USER_AGENTS.length],
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const root = parseHtml(await res.text());
  return parseDetail(root);
}

function parseDetail(root: HTMLElement) {
  // Liga aus dem <title>: "... Ergebnis: <LIGA> - <Altersklasse> - <Datum>"
  const title = (root.querySelector("title")?.text ?? "").replace(/\s+/g, " ");
  let league: string | null = null;
  const lm = title.match(/Ergebnis:\s*(.+?)\s*-\s*[A-Za-zÄÖÜ]/);
  if (lm) league = lm[1].trim();

  // Echter angezeigter Score aus `.result` → Format ": [H : G]" (auch "[- : -]").
  const resultTxt = (root.querySelector(".result")?.text ?? "").replace(/\s+/g, " ");
  const m = resultTxt.match(/\[\s*(\d+)\s*:\s*(\d+)\s*\]/);
  const hasResult = !!m;
  const scoreHeim = m ? parseInt(m[1], 10) : null;
  const scoreGast = m ? parseInt(m[2], 10) : null;
  const totalGoals = hasResult ? (scoreHeim! + scoreGast!) : null;

  // Tor-Events im Spielbericht (.match-course .row-event mit grünem Hexagon).
  const matchCourse = root.querySelector(".match-course");
  const rowEvents = matchCourse ? matchCourse.querySelectorAll(".row-event") : [];
  let goalHex = 0; // Tore mit grünem Hexagon
  let namedGoals = 0; // davon mit verlinktem Spielerprofil (= benannter Torschütze)
  for (const row of rowEvents) {
    const isGoal = row.querySelector(".hexagon.green") !== null;
    if (!isGoal) continue;
    goalHex++;
    const hasPlayer = row
      .querySelectorAll('a[href*="spielerprofil"]')
      .some((a) => /\/(player-id|userid)\//i.test(a.getAttribute("href") || ""));
    if (hasPlayer) namedGoals++;
  }
  return {
    league,
    hasResult,
    scoreHeim,
    scoreGast,
    totalGoals,
    rowEventCount: rowEvents.length,
    goalHex,
    namedGoals,
    hasMatchCourse: matchCourse !== null,
  };
}

// ── Altersklassen-Klassifikation aus Mannschaftsname ─────────────────────────
function ageGroup(name: string): string {
  const n = name.toLowerCase();
  if (/alte herren|\bah\b/.test(n)) return "Alte Herren";
  if (/bambini|g-?junioren|g-?jugend/.test(n)) return "G/Bambini (U7)";
  if (/f-?junioren|f-?jugend/.test(n)) return "F-Jugend (U8/9)";
  if (/e-?junioren|e-?jugend/.test(n)) return "E-Jugend (U10/11)";
  if (/d-?junioren|d-?jugend/.test(n)) return "D-Jugend (U12/13)";
  if (/c-?junioren|c-?jugend|c-?juniorinnen/.test(n)) return "C-Jugend (U14/15)";
  if (/b-?junioren|b-?jugend|b-?juniorinnen/.test(n)) return "B-Jugend (U16/17)";
  if (/a-?junioren|a-?jugend|a-?juniorinnen/.test(n)) return "A-Jugend (U18/19)";
  if (/frauen|damen/.test(n)) return "Frauen";
  if (/juniorinnen|mädchen/.test(n)) return "Juniorinnen";
  if (/herren|\bi+\b|\b\d\b|reserve/.test(n)) return "Herren";
  return "Herren"; // Default: Seniorenmannschaft ohne explizites Label
}

type TeamResult = {
  club: string;
  team: string;
  ageGroup: string;
  league: string | null;
  finishedSampled: number;
  withResult: number;
  withGoals: number;
  matchesWithNamedGoals: number;
  verdict: "BERICHT" | "NUR_ERGEBNIS" | "KEINE_DATEN" | "UNKLAR";
};

async function probeTeam(club: string, t: MannschaftHit): Promise<TeamResult | null> {
  let spiele;
  try {
    spiele = await getSpiele(t.teamId, t.slug, SAISON);
  } catch {
    return null;
  }
  const finished = spiele.filter((s) => s.status === "finished");

  let withResult = 0;
  let withGoals = 0;
  let matchesWithNamedGoals = 0;
  let sampled = 0;
  const leagueVotes = new Map<string, number>();
  for (const s of finished.slice(0, MAX_MATCHES_PER_TEAM)) {
    let d;
    try {
      d = await fetchDetail(s.spielId, s.slug);
    } catch {
      continue;
    }
    sampled++;
    if (d.league) leagueVotes.set(d.league, (leagueVotes.get(d.league) ?? 0) + 1);
    if (d.hasResult) withResult++;
    if (d.totalGoals && d.totalGoals > 0) withGoals++;
    if (d.namedGoals > 0) matchesWithNamedGoals++;
    await sleep(DETAIL_DELAY_MS);
  }
  // Häufigste Liga aus den geprüften Detailseiten, sonst Listen-Fallback.
  const league =
    [...leagueVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    finished.find((s) => s.league)?.league ??
    null;

  let verdict: TeamResult["verdict"];
  if (matchesWithNamedGoals > 0) verdict = "BERICHT";
  else if (withResult === 0) verdict = "KEINE_DATEN";
  else if (withGoals >= 2) verdict = "NUR_ERGEBNIS";
  else verdict = "UNKLAR";

  return {
    club,
    team: t.name,
    ageGroup: ageGroup(t.name),
    league,
    finishedSampled: sampled,
    withResult,
    withGoals,
    matchesWithNamedGoals,
    verdict,
  };
}

async function main() {
  // ── Phase 0: Alle (Verein, Team)-Paare einsammeln ──────────────────────────
  const pairs: { club: string; team: MannschaftHit }[] = [];
  for (const q of CLUB_QUERIES) {
    let vereine;
    try {
      vereine = await searchVereine(q);
    } catch (e) {
      console.error(`✗ searchVereine("${q}") ${e}`);
      continue;
    }
    if (!vereine.length) {
      console.error(`✗ kein Verein für "${q}"`);
      continue;
    }
    const v = vereine[0];
    let teams: MannschaftHit[];
    try {
      teams = await getMannschaften(v.vereinId, v.slug, v.name);
    } catch (e) {
      console.error(`✗ getMannschaften("${v.name}") ${e}`);
      continue;
    }
    console.error(`### ${v.name} → ${teams.length} Mannschaften (cap ${MAX_TEAMS_PER_CLUB})`);
    for (const t of teams.slice(0, MAX_TEAMS_PER_CLUB)) {
      pairs.push({ club: v.name, team: t });
    }
  }

  // ── Phase 1: Nach Altersklasse gruppieren + pro Gruppe begrenzt sampeln ─────
  const byGroup = new Map<string, { club: string; team: MannschaftHit }[]>();
  for (const p of pairs) {
    const g = ageGroup(p.team.name);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(p);
  }
  // Interleave je Gruppe nach Verein für Liga-Vielfalt, dann cap.
  const sampled: { club: string; team: MannschaftHit }[] = [];
  for (const [g, list] of byGroup) {
    const seen = new Set<string>();
    const dedup = list.filter((p) => {
      if (seen.has(p.team.teamId)) return false;
      seen.add(p.team.teamId);
      return true;
    });
    console.error(`  Altersklasse ${g}: ${dedup.length} Teams → sample ${Math.min(dedup.length, SAMPLE_PER_AGE)}`);
    sampled.push(...dedup.slice(0, SAMPLE_PER_AGE));
  }
  console.error(`\n>>> Probe ${sampled.length} Mannschaften (≤${MAX_MATCHES_PER_TEAM} Spiele je)\n`);

  // ── Phase 2: Probe ─────────────────────────────────────────────────────────
  const all: TeamResult[] = [];
  let i = 0;
  for (const { club, team: t } of sampled) {
    i++;
    const r = await probeTeam(club, t);
    if (!r) {
      console.error(`[${i}/${sampled.length}] – ${t.name}: keine Spiele/Fehler`);
      continue;
    }
    all.push(r);
    console.error(
      `[${i}/${sampled.length}] ${r.verdict.padEnd(12)} ${r.ageGroup.padEnd(16)} ${(r.league ?? "?").padEnd(22)} ${r.club} / ${r.team}` +
        `  [Bericht ${r.matchesWithNamedGoals}/${r.finishedSampled}, mitToren ${r.withGoals}]`
    );
    await sleep(TEAM_DELAY_MS);
  }

  // ── Aggregation ───────────────────────────────────────────────────────────
  console.log("\n\n================ ERGEBNIS-MATRIX ================");
  console.log(`Geprüfte Mannschaften: ${all.length} aus ${CLUB_QUERIES.length} Vereins-Queries\n`);

  const byAge = new Map<string, TeamResult[]>();
  for (const r of all) {
    if (!byAge.has(r.ageGroup)) byAge.set(r.ageGroup, []);
    byAge.get(r.ageGroup)!.push(r);
  }
  const order = [
    "Herren", "Frauen", "Alte Herren",
    "A-Jugend (U18/19)", "B-Jugend (U16/17)", "C-Jugend (U14/15)",
    "D-Jugend (U12/13)", "E-Jugend (U10/11)", "F-Jugend (U8/9)",
    "G/Bambini (U7)", "Juniorinnen",
  ];
  const ageKeys = [...byAge.keys()].sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)
  );
  console.log("ALTERSKLASSE         | n  | Bericht | nurErgebnis | keineDaten | unklar");
  console.log("---------------------|----|---------|-------------|------------|-------");
  for (const k of ageKeys) {
    const g = byAge.get(k)!;
    const c = (v: string) => g.filter((r) => r.verdict === v).length;
    console.log(
      `${k.padEnd(20)} | ${String(g.length).padStart(2)} | ${String(c("BERICHT")).padStart(7)} | ${String(c("NUR_ERGEBNIS")).padStart(11)} | ${String(c("KEINE_DATEN")).padStart(10)} | ${String(c("UNKLAR")).padStart(6)}`
    );
  }

  console.log("\n\n================ DETAIL (BERICHT-Mannschaften mit Liga) ================");
  for (const r of all.filter((r) => r.verdict === "BERICHT").sort((a, b) => a.ageGroup.localeCompare(b.ageGroup))) {
    console.log(`  ${r.ageGroup.padEnd(16)} ${(r.league ?? "?").padEnd(24)} ${r.club} / ${r.team}`);
  }
  console.log("\n--- NUR_ERGEBNIS (Score da, KEINE Torschützen) ---");
  for (const r of all.filter((r) => r.verdict === "NUR_ERGEBNIS")) {
    console.log(`  ${r.ageGroup.padEnd(16)} ${(r.league ?? "?").padEnd(24)} ${r.club} / ${r.team}`);
  }
  console.log("\n--- KEINE_DATEN (kein Ergebnis hinterlegt) ---");
  for (const r of all.filter((r) => r.verdict === "KEINE_DATEN")) {
    console.log(`  ${r.ageGroup.padEnd(16)} ${(r.league ?? "?").padEnd(24)} ${r.club} / ${r.team}`);
  }

  // JSON-Dump für spätere Auswertung
  console.log("\n\n===JSON===");
  console.log(JSON.stringify(all));
}

main().catch((e) => { console.error(e); process.exit(1); });
