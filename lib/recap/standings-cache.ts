import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { getLeagueStandings, type LeagueStandings } from "@/lib/crawler/fussballde";
import { getStoredStandings, storeStandings } from "@/lib/db/queries/standings";
import { currentSaisonCode } from "@/lib/utils/saison";
import { inngest } from "@/lib/inngest/client";

/**
 * Read-Through-Cache auf die Liga-Tabelle einer Mannschaft (Saison).
 *
 * Die Tabelle liefert die VERIFIZIERTEN Voll-Saison-Aggregate fürs Wrapped
 * (Tore/Siege/Platz). Der Scrape ist teuer (echter Browser, ~5 s — ajax.team.table
 * blockt plain fetch), darf aber NIE im Request-Pfad jedes Aufrufs passieren.
 *
 * Strategie:
 *  1. Persistente DB-Tabelle `team_standings` (überlebt Redeploys, geteilt über
 *     alle Prozesse) als primäre Quelle. Ist eine Zeile da und frisch → instant.
 *  2. Cache-Miss/stale → einmalig scrapen, in die DB schreiben, zurückgeben.
 *     Ab dann ist JEDER weitere Aufruf (auch nach Redeploy/anderer Container)
 *     instant. Eine ABGESCHLOSSENE Saison ändert sich nicht mehr → lange TTL.
 *  3. Scrape schlägt fehl → falls eine (auch ältere) DB-Zeile existiert, die
 *     zurückgeben statt null; sonst null. Das Wrapped fällt dann ehrlich auf die
 *     ausgewerteten Einzelspiele zurück. Wirft NIE.
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

function isFresh(
  stored: { data: LeagueStandings; scrapedAt: Date },
  saison: string
): boolean {
  const age = Date.now() - stored.scrapedAt.getTime();
  const hasRows = stored.data?.rows?.length > 0;
  // Zeilen aus der Zeit VOR den Liga-Extras (Torschützen/Fairness) einmalig
  // nachscrapen, damit die neuen Slides erscheinen. Ein neuer Scrape setzt
  // topScorers immer (mind. []) → danach greift wieder die normale TTL.
  if (hasRows && stored.data.topScorers === undefined) return false;
  if (!hasRows) return age < EMPTY_RETRY_MS;
  return age < (saison === currentSaisonCode() ? RUNNING_TTL_MS : TTL_MS);
}

export async function getCachedStandings(
  teamId: string,
  saison: string
): Promise<LeagueStandings | null> {
  let stored: { data: LeagueStandings; scrapedAt: Date } | null = null;
  try {
    stored = await getStoredStandings(teamId, saison);
    if (stored && isFresh(stored, saison)) return stored.data;
  } catch {
    // DB-Lesefehler ist non-fatal — wir versuchen den Scrape direkt.
  }

  // Cache-Miss oder stale → einmal scrapen + persistieren.
  try {
    const [t] = await db
      .select({
        fid: teams.fussballdeTeamId,
        slug: teams.fussballdeSlug,
        clubName: clubs.name
      })
      .from(teams)
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(teams.id, teamId))
      .limit(1);

    if (t?.fid && t.slug) {
      const fresh = await getLeagueStandings(t.fid, t.slug, saison, t.clubName);
      if (fresh) {
        await storeStandings(teamId, saison, fresh);
        return fresh;
      }
    }
  } catch {
    // best-effort — Scrape/Persist-Fehler darf das Wrapped nicht kippen.
  }

  // Scrape lieferte nichts: lieber die (ggf. veraltete) DB-Zeile als null.
  return stored?.data ?? null;
}

/**
 * Request-Pfad-Variante fürs Wrapped (Seite + Share-Bild): scrapt NIEMALS
 * synchron. Bei Cache-Miss/stale wird der Prewarm-Job (`recap/prewarm-standings`)
 * gefeuert und SOFORT die (ggf. veraltete) DB-Zeile bzw. `null` geliefert — die
 * tabellenbasierten Slides füllen sich beim nächsten Aufruf. Damit launcht der
 * Render-Pfad nie Chromium (~6–30 s). Ein stündlicher Event-Bucket dedupliziert
 * parallele Betrachter.
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
      // Prewarm ist best-effort; das Wrapped rendert auch ohne Tabelle.
    });

  return stored?.data ?? null;
}
