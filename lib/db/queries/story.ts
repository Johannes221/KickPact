import { and, asc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { resolveTeamSide } from "@/lib/crawler/team-side";
import { berlinDayStart } from "@/lib/story/story-content";

/**
 * Query-Layer für die Instagram-Story-Vorlagen (Aufgabe #44).
 *
 * Liest ausschließlich, was real im Schema steht — die Vorlagen erfinden
 * nichts. Insbesondere gibt es KEINEN Spielort/keine Adresse: weder `matches`
 * noch der Crawler führen das Feld (Scraper-Erweiterung ist out of scope), die
 * Vorlage kommt deshalb ohne aus.
 */

export interface StoryMatch {
  id: string;
  datum: Date;
  status: string;
  heimName: string;
  gastName: string;
  heimTeamId: string | null;
  gastTeamId: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  /** Eigene Spielseite — team-id-first via resolveTeamSide, nicht geraten. */
  ownSide: "heim" | "gast";
}

export interface StoryTeam {
  id: string;
  name: string;
  saison: string;
  league: string | null;
  logoUrl: string | null;
  fussballdeTeamId: string | null;
  clubName: string;
}

/** Stammdaten der eigenen Mannschaft für die Story (inkl. Liga + Logo). */
export async function getStoryTeam(teamId: string): Promise<StoryTeam | null> {
  const [row] = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      league: teams.league,
      logoUrl: teams.logoUrl,
      fussballdeTeamId: teams.fussballdeTeamId,
      clubName: clubs.name
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  return row ?? null;
}

function withOwnSide(
  rows: (typeof matches.$inferSelect)[],
  team: StoryTeam
): StoryMatch[] {
  return rows.map((m) => ({
    id: m.id,
    datum: m.datum,
    status: m.status,
    heimName: m.heimName,
    gastName: m.gastName,
    heimTeamId: m.heimTeamId,
    gastTeamId: m.gastTeamId,
    ergebnisHeim: m.ergebnisHeim,
    ergebnisGast: m.ergebnisGast,
    ownSide: resolveTeamSide(m, team.fussballdeTeamId, [team.name, team.clubName])
  }));
}

/**
 * Nächstes anstehendes Spiel der Mannschaft — Quelle für die „Bevorstehendes
 * Spiel"-Karte und den Vorschau-CTA (nimmt automatisch das nächste Spiel).
 *
 * `cancelled` ist bewusst raus (kein Ankündigen abgesagter Spiele), `live` und
 * `postponed` sind drin: ein laufendes Spiel ist noch keine Rückschau, und ein
 * verlegtes behält bis zum neuen Termin sein Datum.
 *
 * Verglichen wird auf TAGES-Ebene (berlinDayStart), nicht gegen `now` — siehe
 * dort: `datum` ist ein Kalendertag mit Fake-Mittagszeit, ein Vergleich gegen
 * die Uhrzeit ließe das heutige Spiel mittags aus der Karte verschwinden.
 */
export async function getNextMatchForTeam(
  teamId: string,
  now: Date = new Date()
): Promise<StoryMatch | null> {
  const team = await getStoryTeam(teamId);
  if (!team) return null;

  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.teamId, teamId),
        inArray(matches.status, ["scheduled", "live", "postponed"]),
        gte(matches.datum, berlinDayStart(now))
      )
    )
    .orderBy(asc(matches.datum))
    .limit(1);

  return rows.length > 0 ? withOwnSide(rows, team)[0] : null;
}

/**
 * Ein bestimmtes Spiel der Mannschaft.
 *
 * Der Filter auf `teamId` ist die Trust-Boundary: `matchId` kommt aus der URL
 * und ist damit client-kontrolliert. Ohne diese Bedingung könnte man mit einer
 * fremden matchId eine Story über ein fremdes Spiel rendern lassen.
 */
export async function getStoryMatch(
  teamId: string,
  matchId: string
): Promise<StoryMatch | null> {
  const team = await getStoryTeam(teamId);
  if (!team) return null;

  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)))
    .limit(1);

  return rows.length > 0 ? withOwnSide(rows, team)[0] : null;
}

export interface StoryScorer {
  name: string;
  /** Anzahl Tore dieses Spielers in diesem Spiel (Doppelpack → 2). */
  tore: number;
}

/**
 * Torschützen EINER Seite eines Spiels, nach Toren absteigend.
 *
 * fussball.de führt benannte Torschützen nur zuverlässig bei Herren/Frauen/
 * A+B-Jugend — bei allen anderen bleibt die Liste leer (oder die Namen fehlen).
 * Deshalb: Events ohne `playerName` fallen raus statt als „—" in der Story zu
 * landen, und die Vorlage muss ohne Torschützen gut aussehen.
 */
export async function getMatchScorers(
  matchId: string,
  side: "heim" | "gast"
): Promise<StoryScorer[]> {
  const rows = await db
    .select({ playerName: matchEvents.playerName })
    .from(matchEvents)
    .where(
      and(
        eq(matchEvents.matchId, matchId),
        eq(matchEvents.type, "tor"),
        eq(matchEvents.side, side),
        isNotNull(matchEvents.playerName),
        ne(matchEvents.playerName, "")
      )
    );

  const byName = new Map<string, number>();
  for (const r of rows) {
    const name = r.playerName?.trim();
    if (!name) continue;
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  return [...byName.entries()]
    .map(([name, tore]) => ({ name, tore }))
    .sort((a, b) => b.tore - a.tore || a.name.localeCompare(b.name, "de-DE"));
}

/**
 * Logo des Gegners — nur, wenn der Gegner selbst eine KickPact-Mannschaft mit
 * ÖFFENTLICHEM Profil ist (`discoverable`) und ein Logo hochgeladen hat.
 *
 * Warum dieses Gate: das Logo ist ein Asset eines anderen Mandanten. Bei einer
 * discoverable Mannschaft liegt es ohnehin öffentlich sichtbar auf `/m/<slug>`
 * — das ist die vorhandene Einwilligung. Für nicht-öffentliche Mannschaften
 * wird nichts übernommen; die Story zeigt dann das Kürzel.
 *
 * Verknüpft wird über die eindeutige fussball.de-team-id, nicht über den Namen
 * (Namens-Matching kollidiert bei Reserve-Derbys/gleicher Stadt).
 */
export async function getOpponentLogoUrl(
  fussballdeTeamId: string | null
): Promise<string | null> {
  if (!fussballdeTeamId) return null;
  const [row] = await db
    .select({ logoUrl: teams.logoUrl })
    .from(teams)
    .where(
      and(
        eq(teams.fussballdeTeamId, fussballdeTeamId),
        eq(teams.discoverable, true),
        isNotNull(teams.logoUrl)
      )
    )
    .limit(1);
  return row?.logoUrl ?? null;
}
