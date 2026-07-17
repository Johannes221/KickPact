import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { getLeagueStandings, type LeagueStandings } from "@/lib/crawler/fussballde";
import { getStoredStandings, storeStandings } from "@/lib/db/queries/standings";
import { isFresh } from "@/lib/recap/standings-request";
import { currentSaisonCode } from "@/lib/utils/saison";

/**
 * Read-Through-Cache auf die Liga-Tabelle einer Mannschaft (Saison).
 *
 * Die Tabelle liefert die VERIFIZIERTEN Voll-Saison-Aggregate fürs Wrapped
 * (Tore/Siege/Platz). Der Scrape ist teuer (echter Browser, ~5 s — ajax.team.table
 * blockt plain fetch), darf aber NIE im Request-Pfad jedes Aufrufs passieren.
 *
 * Diese Datei zieht den Scraper (und damit chromium) — sie gehört in den
 * Hintergrund-Job. Der Render-/Query-Pfad nutzt stattdessen das browser-freie
 * {@link ./standings-request.ts}.
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
      // Für ABGESCHLOSSENE Saisons die bekannte Staffel mitgeben: nur die
      // Staffel-Seite ist an ihre Saison gebunden — die Mannschaftsseite leitet
      // auf die laufende Saison um, womit eine alte Tabelle sonst nie wieder
      // refreshbar wäre. Für die LAUFENDE Saison bewusst NICHT: dort leitet
      // nichts um, und der reguläre Weg erkennt die Staffel jedes Mal neu (eine
      // im Saisonverlauf umgruppierte Mannschaft bliebe sonst an der alten
      // Staffel kleben).
      const knownStaffelId =
        saison === currentSaisonCode() ? null : stored?.data?.staffelId ?? null;
      const fresh = await getLeagueStandings(
        t.fid,
        t.slug,
        saison,
        t.clubName,
        knownStaffelId
      );
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
