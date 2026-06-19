import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teamStandings } from "@/lib/db/schema/standings";
import type { LeagueStandings } from "@/lib/crawler/fussballde";

/**
 * DB-Query-Layer für die persistierte Liga-Tabelle (`team_standings`).
 *
 * BEWUSST browser-frei: importiert nur den `LeagueStandings`-TYP (erased), nie
 * `getLeagueStandings` → kein chromium im Bundle. Der teure Browser-Scrape lebt
 * in {@link lib/recap/standings-cache.ts}, das diesen Layer als Cache nutzt.
 */

export interface StoredStandings {
  data: LeagueStandings;
  scrapedAt: Date;
}

/** Liest die gespeicherte Tabelle für (Mannschaft, Saison) — null wenn nie gescrapt. */
export async function getStoredStandings(
  teamId: string,
  saison: string
): Promise<StoredStandings | null> {
  const [row] = await db
    .select({ data: teamStandings.data, scrapedAt: teamStandings.scrapedAt })
    .from(teamStandings)
    .where(
      and(eq(teamStandings.teamId, teamId), eq(teamStandings.saison, saison))
    )
    .limit(1);
  return row ? { data: row.data, scrapedAt: row.scrapedAt } : null;
}

/** Schreibt/aktualisiert die Tabelle für (Mannschaft, Saison) (Upsert auf dem PK). */
export async function storeStandings(
  teamId: string,
  saison: string,
  data: LeagueStandings
): Promise<void> {
  await db
    .insert(teamStandings)
    .values({ teamId, saison, data })
    .onConflictDoUpdate({
      target: [teamStandings.teamId, teamStandings.saison],
      set: { data, scrapedAt: new Date() }
    });
}
