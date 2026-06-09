/**
 * Server-seitige Coverage-Ermittlung aus fußball.de-Daten.
 *
 * Trennung zum puren `lib/triggers/coverage.ts`: dieses Modul fasst den Scraper
 * an (getSpiele/getSpielDetails) und darf daher NICHT in Client-Komponenten
 * importiert werden. Die reinen Helfer (Floor, combineCoverage, Trigger-Gating)
 * leben drüben.
 */
import { getSpiele, getSpielDetails, type SpielDetails } from "./fussballde";
import type { Coverage } from "@/lib/triggers/coverage";

/** Wie viele jüngste gespielte Spiele die Live-Probe maximal prüft. */
const PROBE_MAX_MATCHES = 5;

/** Hat ein gescraptes Spiel mindestens ein Tor-Event mit benanntem Schützen? */
function hasNamedScorer(d: Pick<SpielDetails, "events">): boolean {
  return d.events.some(
    (e) => e.typ === "TOR" && (Boolean(e.spielerId) || Boolean(e.spielerName))
  );
}

/**
 * Klassifiziert eine Mannschaft anhand bereits gescrapter Spiel-Details:
 *   - mind. ein benannter Torschütze        → `full`
 *   - sonst, aber Spiele vorhanden (Endstand) → `results_only`
 *   - keine gespielten Spiele                → `none`
 *
 * Hinweis: gespielte Spiele tragen per Definition einen Endstand (prev.games).
 * Der Aufrufer kombiniert das Ergebnis via `combineCoverage` mit dem Namens-
 * Floor, damit ein torarmer Spieltag eine Herren-Mannschaft nicht auf `none`
 * zieht (siehe updateTeamCoverage).
 */
export function classifyScrapedMatches(
  details: ReadonlyArray<Pick<SpielDetails, "events">>
): Coverage {
  if (details.length === 0) return "none";
  if (details.some(hasNamedScorer)) return "full";
  return "results_only";
}

/**
 * Live-Probe gegen fußball.de: holt die jüngsten gespielten Spiele der
 * Mannschaft, scrapt eine Stichprobe der Detailseiten und klassifiziert.
 * Reiner HTTP-Scrape (kein DB-Zugriff). Wirft NICHT — bei Fehlern `none`
 * (der Aufrufer hebt via Namens-Floor wieder an).
 */
export async function detectTeamCoverage(
  teamId: string,
  slug: string,
  saison: string
): Promise<Coverage> {
  try {
    const spiele = await getSpiele(teamId, slug, saison);
    const finished = spiele
      .filter((s) => s.status === "finished")
      .slice(0, PROBE_MAX_MATCHES);
    if (finished.length === 0) return "none";

    const details: Pick<SpielDetails, "events">[] = [];
    for (const s of finished) {
      try {
        details.push(await getSpielDetails(s.spielId, s.slug));
      } catch {
        // einzelner Detail-Fetch-Fehler ist tolerierbar
      }
    }
    return classifyScrapedMatches(details);
  } catch {
    return "none";
  }
}
