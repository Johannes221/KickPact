/**
 * Vorsaison-Backfill-Pfad: komplette Saison-Ergebnisse einer Mannschaft über
 * den `ajax.team.matchplan`-Endpoint von fussball.de.
 *
 * Warum nicht `ajax.team.prev.games` (getSpiele)? Der cappt bei ~10 Spielen
 * und IGNORIERT den saison-Parameter — für eine abgeschlossene Vorsaison
 * fehlt damit der Großteil der Spiele (KNOWN LIMITATION in fussballde.ts).
 * Der ursprünglich angedachte Weg (Team-Detailseite → wam_competitions-JSON →
 * Staffel-ID → Spieltagsübersicht, 18–34 Seiten pro Staffel) ist mehrstufig
 * und captcha-riskant. Die Live-Probe (2026-06-11) fand einen besseren Pfad:
 *
 *   https://www.fussball.de/ajax.team.matchplan/-/datum-bis/{bis}/datum-von/{von}
 *     /max/999/mime-type/JSON/mode/PAGE/prev-season-allowed/true
 *     /show-filter/false/team-id/{teamId}
 *
 * liefert ALLE Spiele der Mannschaft im Datumsfenster (inkl. Pokal/Freund-
 * schaftsspiele) als EINE JSON-Antwort (`{success, html}`) — auch für
 * vergangene Saisons (`prev-season-allowed/true`, verifiziert für 2024/25).
 * Statt ~30 Requests pro Team/Saison sind es 2 (Matchplan + Score-Font).
 *
 * Die Ergebnisse im Listen-HTML sind — wie auf der Detailseite — font-
 * verschleiert (PUA-Codepoints + `data-obfuscation`-ID, EINE ID pro Antwort);
 * Dekodierung über den bestehenden fontkit-Decoder (lib/crawler/score-font.ts).
 * Spiele ohne echten Endstand (angesetzt, "Absetzung", "Abbruch",
 * "Nichtantritt" ohne Wertungs-Score) werden verworfen — der Backfill
 * persistiert NUR finished-Spiele mit Ergebnis.
 */
import { fetch as undiciFetch } from "undici";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { withRetry, normalizeTeamName } from "./fussballde";
import { decodeScoreSpanPair, type ScoreFontLoader } from "./score-font";
import { saisonStartDate } from "@/lib/utils/saison";

export interface VorsaisonSpiel {
  spielId: string;
  /** DD.MM.YYYY — gleiches Format wie SpielListItem.datum. */
  datum: string;
  heimName: string;
  gastName: string;
  ergebnisHeim: number;
  ergebnisGast: number;
}

const USER_AGENTS: ReadonlyArray<string> = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
];

/**
 * Beobachter für erfolgreiche Matchplan-Antworten — AUSSCHLIESSLICH für die
 * Fixture-Capture-Pipeline (scripts/fixtures/capture-vorsaison.ts), analog
 * setFetchHtmlObserver in fussballde.ts. Produktiv immer null.
 */
let matchplanObserver: ((url: string, body: string) => void) | null = null;

export function setMatchplanObserver(
  fn: ((url: string, body: string) => void) | null
): void {
  matchplanObserver = fn;
}

/** URL des Matchplan-JSON-Endpoints für ein Team + Datumsfenster. */
export function matchplanUrl(
  fussballdeTeamId: string,
  datumVon: string,
  datumBis: string
): string {
  return (
    `https://www.fussball.de/ajax.team.matchplan/-/datum-bis/${datumBis}` +
    `/datum-von/${datumVon}/max/999/mime-type/JSON/mode/PAGE` +
    `/prev-season-allowed/true/show-filter/false` +
    `/team-id/${encodeURIComponent(fussballdeTeamId)}`
  );
}

/**
 * Holt die Matchplan-JSON-Antwort. Block-Detection wie fetchHtml in
 * fussballde.ts: die fussball.de-Sperrseite (Sicherheitsabfrage/reCAPTCHA)
 * ist KEIN JSON — sie wird laut als Captcha-Fehler geworfen, damit der
 * Aufrufer (Backfill-Job) den Crawl des Teams sauber abbricht statt leere
 * Daten zu persistieren.
 */
async function fetchMatchplanHtml(url: string): Promise<string> {
  return withRetry(
    async () => {
      const res = await undiciFetch(url, {
        headers: {
          "User-Agent":
            USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"
        },
        redirect: "follow"
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // transient
      if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
      const body = await res.text();

      let parsed: { success?: boolean; html?: string };
      try {
        parsed = JSON.parse(body) as { success?: boolean; html?: string };
      } catch {
        // Kein JSON → Block-/Captcha-Seite oder unerwartetes HTML. Captcha
        // IMMER laut werfen (Signal an den Operator), Rest als Parse-Fehler.
        if (
          /g-recaptcha|recaptcha\/api|sicherheitsabfrage|datadome|captcha-delivery|zugriff verweigert|access denied/i.test(
            body
          )
        ) {
          throw new Error("Captcha/Sicherheitsabfrage-Seite erkannt");
        }
        throw new Error(`Matchplan-Antwort ist kein JSON (${body.length}B)`);
      }
      if (!parsed.success || typeof parsed.html !== "string") {
        throw new Error("Matchplan-Antwort ohne success/html");
      }
      matchplanObserver?.(url, body);
      return parsed.html;
    },
    { maxAttempts: 3, baseDelayMs: 800 }
  );
}

/** Normalisiert "DD.MM.YY" / "DD.MM.YYYY" auf DD.MM.YYYY; null wenn unparsbar. */
function normalizeDatum(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${m[1]}.${m[2]}.${year}`;
}

function parseDatumMs(datum: string): number | null {
  const [dd, mm, yyyy] = datum.split(".");
  const t = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`).getTime();
  return Number.isNaN(t) ? null : t;
}

export type GetVorsaisonSpieleOptions = {
  /** Test-Injection für den Score-Font (Default: Live-Fetch mit Cache). */
  loadFont?: ScoreFontLoader;
  /**
   * Höflichkeits-Pause vor dem Font-Request (ms). fussball.de bekommt von
   * diesem Pfad maximal 2 Requests pro Team/Saison — trotzdem ≥800ms Abstand,
   * wie überall im Crawler. Tests setzen 0.
   */
  delayMs?: number;
};

/**
 * Pure Parse-Stufe: Matchplan-HTML (das `html`-Feld der JSON-Antwort) →
 * gespielte Spiele mit Endstand. Von getVorsaisonSpiele und der Fixture-
 * Capture-Pipeline (Offline-Regeneration) geteilt.
 */
export async function parseVorsaisonSpiele(
  html: string,
  saison: string,
  opts: GetVorsaisonSpieleOptions = {}
): Promise<VorsaisonSpiel[]> {
  const start = saisonStartDate(saison);
  if (!start) {
    throw new Error(`Ungültiger Saison-Code: ${saison}`);
  }
  const startYear = start.getFullYear();
  const root = parseHtml(html);

  // Saison-Fenster defensiv auch clientseitig prüfen (Server respektiert
  // datum-von/bis — aber ein Format-Drift soll nie Fremd-Saisons einschleusen).
  const windowStartMs = Date.UTC(startYear, 6, 1);
  const windowEndMs = Date.UTC(startYear + 1, 6, 1);

  const delayMs = opts.delayMs ?? 800;
  let firstFontUse = true;

  const out: VorsaisonSpiel[] = [];
  const seen = new Set<string>();
  let currentDatum: string | null = null;

  for (const tr of root.querySelectorAll("tr")) {
    // Datum-Carry-over: row-headline ("Sonntag, 18.05.2025 - 15:00 Uhr | …")
    // und row-competition ("So, 18.05.25 | 15:00 …") tragen das Datum der
    // folgenden Spiel-Zeile(n). 2-stelliges Jahr wird auf YYYY normalisiert.
    if (
      tr.classList.contains("row-headline") ||
      tr.classList.contains("row-competition")
    ) {
      // Review N3 (2026-06-11): Eine UNPARSEBARE row-headline (sie leitet
      // immer einen neuen Datums-Block ein) resettet das Carry-over — sonst
      // bekommt das folgende Spiel still den Spieltag der vorigen Zeile.
      // row-competition-Zeilen tragen dagegen teils KEIN Datum (z.B. reine
      // Wettbewerbs-Beschriftung) und verlassen sich auf die Headline davor
      // → dort nur überschreiben, wenn wirklich ein Datum drinsteht.
      const datum = normalizeDatum(tr.text);
      if (datum) {
        currentDatum = datum;
      } else if (tr.classList.contains("row-headline")) {
        currentDatum = null;
      }
      continue;
    }

    const scoreCell = tr.querySelector("td.column-score");
    if (!scoreCell) continue;

    const link = scoreCell.querySelector('a[href*="/spiel/"]');
    const href = link?.getAttribute("href") ?? "";
    const m = href.match(/\/spiel\/[^/]+\/-\/spiel\/([A-Z0-9]+)/);
    if (!m || seen.has(m[1])) continue;

    // "Absetzung" / "Abbruch" / "Nichtantritt HEIM|GAST" rendern als
    // info-text statt Score-Spans → kein echter Endstand, überspringen.
    if (scoreCell.querySelector(".info-text")) continue;

    if (!currentDatum) continue;
    const datumMs = parseDatumMs(currentDatum);
    if (datumMs === null || datumMs < windowStartMs || datumMs >= windowEndMs) {
      continue;
    }

    const clubNames = tr
      .querySelectorAll("td.column-club .club-name")
      .map((el) => normalizeTeamName(el.text));
    if (clubNames.length < 2 || !clubNames[0] || !clubNames[1]) continue;

    // Höflichkeit: der Default-Loader holt den Font live — vor dem ersten
    // Font-Request kurz pausieren, damit zwischen Matchplan- und Font-Fetch
    // ≥delayMs liegen. Gecachte Folge-Aufrufe (gleiche Obfuscation-ID pro
    // Antwort) treffen das Netz nicht mehr.
    if (!opts.loadFont && firstFontUse && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    firstFontUse = false;

    // `undefined` als Loader → decodeScoreSpanPair fällt auf den Live-Loader
    // (Default-Parameter) zurück.
    const score = await decodeScoreSpanPair(
      scoreCell.querySelector(".score-left"),
      scoreCell.querySelector(".score-right"),
      opts.loadFont
    );
    if (!score) continue; // kein/nicht dekodierbares Ergebnis → nicht finished

    seen.add(m[1]);
    out.push({
      spielId: m[1],
      datum: currentDatum,
      heimName: clubNames[0],
      gastName: clubNames[1],
      ergebnisHeim: score.heim,
      ergebnisGast: score.gast
    });
  }

  // Chronologisch aufsteigend — stabil für Anzeige und Insert-Reihenfolge.
  out.sort((a, b) => (parseDatumMs(a.datum) ?? 0) - (parseDatumMs(b.datum) ?? 0));
  return out;
}

/**
 * Liefert alle GESPIELTEN Spiele (echter Endstand) einer Mannschaft für die
 * angefragte Saison (4-stelliger Code, z.B. "2526" = Juli 2025–Juni 2026).
 *
 * Wirft bei Captcha/Block laut (Caller bricht den Team-Backfill ab). Eine
 * leere Liste ist ein legitimes Ergebnis (Team hatte keine erfassten Spiele).
 */
export async function getVorsaisonSpiele(
  fussballdeTeamId: string,
  saison: string,
  opts: GetVorsaisonSpieleOptions = {}
): Promise<VorsaisonSpiel[]> {
  const start = saisonStartDate(saison);
  if (!start) {
    throw new Error(`Ungültiger Saison-Code: ${saison}`);
  }
  const startYear = start.getFullYear();
  const datumVon = `${startYear}-07-01`;
  const datumBis = `${startYear + 1}-06-30`;

  const html = await fetchMatchplanHtml(
    matchplanUrl(fussballdeTeamId, datumVon, datumBis)
  );
  const spiele = await parseVorsaisonSpiele(html, saison, opts);
  console.log(
    `[getVorsaisonSpiele] team=${fussballdeTeamId.slice(0, 8)} saison=${saison} → ${spiele.length} Spiele mit Endstand`
  );
  return spiele;
}
