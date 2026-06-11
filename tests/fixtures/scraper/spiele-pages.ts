// tests/fixtures/scraper/spiele-pages.ts
//
// Gemeinsames URL↔Dateiname-Mapping für die HTML-Fixtures der getSpiele-
// Pagination. getSpiele (lib/crawler/fussballde.ts, paginateTeamGames) holt
// pro Team/Saison bis zu vier AJAX-Strategien — prev/next × ohne/mit
// saison-Parameter — mit jeweils mehreren index-Seiten. Ein einzelnes
// HTML-Fixture pro Team/Saison kann den Live-Lauf deshalb nicht reproduzieren
// (Option a aus der Fixture-Spezifikation: eine Datei pro AJAX-Request).
//
// Verwendet von BEIDEN Seiten der Pipeline:
//   - scripts/fixtures/capture-fixtures.ts mappt beobachtete Live-URLs auf
//     Dateinamen (parseAjaxTeamGamesUrl → spielePageFileName).
//   - tests/scraper/parser/get-spiele.test.ts mappt vorhandene Dateien zurück
//     auf exakte URL-Routen (parseSpielePageFileName → spielePageUrlRegex).
//
// Dateinamens-Schema:
//   <teamKey>-spiele-saison<YYYY>-<prev|next>[-saison]-p<index>.html
// `-saison` markiert Requests MIT saison-Parameter in der URL; der Saison-Code
// im Dateinamen ist immer die Saison des Capture-Laufs (auch für die
// parameterlosen prev/next-Requests, die fussball.de saisonunabhängig liefert).

export type SpielePage = {
  kind: "prev" | "next";
  withSaison: boolean;
  index: number;
};

const AJAX_URL_RE =
  /\/ajax\.team\.(prev|next)\.games\/-\/mode\/PAGE\/team-id\/([^/]+)(?:\/saison\/([^/]+))?(?:\/index\/(\d+))?$/;

const FILE_RE =
  /^(.+)-spiele-saison(\d{4})-(prev|next)(-saison)?-p(\d+)\.html$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Zerlegt eine `ajax.team.{prev|next}.games`-URL in ihre Pagination-Parameter.
 * Liefert null für alle anderen URLs (Detailseiten, Spielerprofile, …).
 */
export function parseAjaxTeamGamesUrl(
  url: string,
): (SpielePage & { teamId: string }) | null {
  const m = url.match(AJAX_URL_RE);
  if (!m) return null;
  return {
    kind: m[1] as "prev" | "next",
    teamId: decodeURIComponent(m[2]),
    withSaison: m[3] !== undefined,
    index: m[4] !== undefined ? parseInt(m[4], 10) : 0,
  };
}

/** Fixture-Dateiname für eine Pagination-Seite (relativ zum Club-Ordner). */
export function spielePageFileName(
  teamKey: string,
  saison: string,
  page: SpielePage,
): string {
  const saisonSeg = page.withSaison ? "-saison" : "";
  return `${teamKey}-spiele-saison${saison}-${page.kind}${saisonSeg}-p${page.index}.html`;
}

/**
 * Inverse von spielePageFileName. teamKey wird von rechts geparst, damit
 * Dashes im Key ("a-junioren") nicht stören. Liefert null für fremde Dateien.
 */
export function parseSpielePageFileName(
  file: string,
): (SpielePage & { teamKey: string; saison: string }) | null {
  const m = file.match(FILE_RE);
  if (!m) return null;
  return {
    teamKey: m[1],
    saison: m[2],
    kind: m[3] as "prev" | "next",
    withSaison: m[4] !== undefined,
    index: parseInt(m[5], 10),
  };
}

/**
 * Exakte (verankerte) URL-Regex für genau diese Pagination-Seite — Aufbau
 * spiegelt paginateTeamGames: base + optionales /saison/ + optionales /index/.
 * Verankert, damit sich die vier Strategien nicht gegenseitig matchen
 * (Seite 0 ist Präfix jeder index-Seite, ohne-saison ist Präfix von mit-saison).
 */
export function spielePageUrlRegex(
  teamId: string,
  saison: string,
  page: SpielePage,
): RegExp {
  const base = `https://www\\.fussball\\.de/ajax\\.team\\.${page.kind}\\.games/-/mode/PAGE/team-id/${escapeRegex(encodeURIComponent(teamId))}`;
  const saisonSeg = page.withSaison
    ? `/saison/${escapeRegex(encodeURIComponent(saison))}`
    : "";
  const indexSeg = page.index === 0 ? "" : `/index/${page.index}`;
  return new RegExp(`^${base}${saisonSeg}${indexSeg}$`);
}
