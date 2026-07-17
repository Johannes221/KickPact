import { getStoredStandings } from "@/lib/db/queries/standings";
import type { LeagueStandings } from "@/lib/crawler/fussballde";
import { currentSaisonCode } from "@/lib/utils/saison";
import { inngest } from "@/lib/inngest/client";

/**
 * Request-Pfad auf die Liga-Tabelle: liest NUR die DB und stößt bei Bedarf den
 * Prewarm-Job an. Scrapt niemals selbst.
 *
 * BEWUSST browser-frei (nur Typ-Import von LeagueStandings) — deshalb liegt das
 * hier und nicht in {@link ./standings-cache.ts}, das den echten Scraper (und
 * damit chromium) zieht. Nur so können Server Components und der Query-Layer die
 * Tabelle nutzen, ohne einen Browser ins Bundle zu holen.
 */

// Abgeschlossene-Saison-Tabellen sind final → großzügige TTL. Nur ein leerer
// Treffer (Scrape lief, fand aber nichts) wird häufiger neu versucht.
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const EMPTY_RETRY_MS = 12 * 60 * 60 * 1000; // 12 h für leere Treffer
/**
 * LAUFENDE Saison: die Tabelle ändert sich jedes Wochenende. Die 30-Tage-TTL
 * oben gilt nur für abgeschlossene Saisons (Wrapped-Fall) — für die laufende
 * Saison wäre sie ein wochenalter Tabellenplatz auf einer Story-Vorschau, also
 * eine stille Falschaussage. Spiele sind am Wochenende, 12 h reichen völlig.
 */
const RUNNING_TTL_MS = 12 * 60 * 60 * 1000;

export function isFresh(
  stored: { data: LeagueStandings; scrapedAt: Date },
  saison: string
): boolean {
  const age = Date.now() - stored.scrapedAt.getTime();
  const hasRows = stored.data?.rows?.length > 0;
  // Zeilen aus der Zeit VOR den Liga-Extras (Torschützen/Fairness) einmalig
  // nachscrapen, damit die neuen Slides erscheinen. Ein neuer Scrape setzt
  // topScorers immer (mind. []) → danach greift wieder die normale TTL.
  if (hasRows && stored.data.topScorers === undefined) return false;
  // Ebenso einmalig nachscrapen, wenn die Zeilen noch keine team-ids tragen:
  // solche Zeilen stammen aus der Zeit des Namens-Matchings, das `ownRow` bei
  // Kurznamen und Spielgemeinschaften still auf null setzte (Dossenheim zeigte
  // dadurch 10 statt 34 Spiele). Ein neuer Scrape setzt teamId auf jeder Zeile
  // → danach greift wieder die normale TTL.
  if (hasRows && stored.data.rows.every((r) => r.teamId === undefined)) return false;
  if (!hasRows) return age < EMPTY_RETRY_MS;
  return age < (saison === currentSaisonCode() ? RUNNING_TTL_MS : TTL_MS);
}

/**
 * Tabelle für den Render-Pfad: scrapt NIEMALS synchron. Bei Cache-Miss/stale
 * wird der Prewarm-Job (`recap/prewarm-standings`) gefeuert und SOFORT die
 * (ggf. veraltete) DB-Zeile bzw. `null` geliefert — die tabellenbasierten Zahlen
 * füllen sich beim nächsten Aufruf. Damit launcht der Render-Pfad nie Chromium
 * (~6–30 s). Ein stündlicher Event-Bucket dedupliziert parallele Betrachter.
 * Wirft nie.
 */
export async function getCachedStandingsForRequest(
  teamId: string,
  saison: string
): Promise<LeagueStandings | null> {
  let stored: { data: LeagueStandings; scrapedAt: Date } | null = null;
  try {
    stored = await getStoredStandings(teamId, saison);
    if (stored && isFresh(stored, saison)) return stored.data;
  } catch {
    // DB-Lesefehler → wie Cache-Miss behandeln.
  }

  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  await inngest
    .send({
      id: `recap-prewarm-${teamId}-${saison}-${hourBucket}`,
      name: "recap/prewarm-standings",
      data: { teamId, saison }
    })
    .catch(() => {
      // Prewarm ist best-effort; die Seite rendert auch ohne Tabelle.
    });

  return stored?.data ?? null;
}
