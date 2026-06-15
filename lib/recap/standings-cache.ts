import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { getLeagueStandings, type LeagueStandings } from "@/lib/crawler/fussballde";

/**
 * Gecachter, best-effort Zugriff auf die Liga-Tabelle einer Mannschaft.
 *
 * Die Tabelle liefert die VERIFIZIERTEN Voll-Saison-Aggregate fürs Wrapped
 * (Tore/Siege/Platz). Der Scrape ist teuer (Browser, ~5 s — ajax.team.table
 * blockt plain fetch), aber die Tabelle ändert sich pro Saison kaum → In-Memory-
 * Cache mit 6h-TTL. Single-Container-Deploy = ein Prozess → Cache greift über
 * Requests. Wirft NIE: ohne fussball.de-Referenz oder bei Scrape-Fehler → null,
 * das Wrapped fällt dann ehrlich auf die ausgewerteten Spiele zurück.
 */
type Entry = { value: LeagueStandings | null; at: number };
const CACHE = new Map<string, Entry>();
const TTL_MS = 6 * 60 * 60 * 1000;

export async function getCachedStandings(
  teamId: string,
  saison: string
): Promise<LeagueStandings | null> {
  const key = `${teamId}:${saison}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: LeagueStandings | null = null;
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
      value = await getLeagueStandings(t.fid, t.slug, saison, t.clubName);
    }
  } catch {
    value = null; // best-effort — Wrapped lebt ohne Tabelle weiter.
  }
  CACHE.set(key, { value, at: Date.now() });
  return value;
}
