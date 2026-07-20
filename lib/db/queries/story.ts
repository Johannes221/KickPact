import { and, asc, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { resolveTeamSide, matchHasNameCollision } from "@/lib/crawler/team-side";
import { berlinDayStart } from "@/lib/story/story-content";
import { getClubCrestLogoUrl } from "@/lib/db/queries/club-crests";

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
  /** Eigene Spielseite via resolveTeamSide (team-id-first, Namens-Fallback). */
  ownSide: "heim" | "gast";
  /**
   * Ist `ownSide` VERTRAUENSWÜRDIG?
   *
   * Wichtig für kommende Spiele: `upsertScheduledMatch` legt Spielplan-Stubs
   * OHNE heim/gastTeamId an (die ids kommen erst mit dem Detail-Scrape des
   * gespielten Spiels). Bei `scheduled` fällt `resolveTeamSide` deshalb IMMER
   * aufs Namens-Matching zurück — und das kippt bei Reserve-Derbys („SV X II"
   * vs „SV X III") deterministisch auf „heim", weil der Token in beiden Namen
   * steckt. Ohne dieses Flag behauptete die Story „Heimspiel" statt
   * „Auswärtsspiel" bzw. drehte im Rückblick Ausgang und Torschützen um.
   *
   * false ⇒ die Vorlage lässt alles weg, was von der Seite abhängt, statt zu
   * raten. Erkennung über `matchHasNameCollision` — derselbe Detektor, der die
   * Falschgeld-Fälle markiert.
   */
  ownSideReliable: boolean;
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
  const names = [team.name, team.clubName];
  return rows.map((m) => {
    // Die team-id entscheidet nur, wenn sie gespeichert ist UND auf genau eine
    // Seite passt — sonst rät resolveTeamSide über die Namen.
    const idDecided =
      !!team.fussballdeTeamId &&
      (m.heimTeamId === team.fussballdeTeamId || m.gastTeamId === team.fussballdeTeamId);
    return {
      id: m.id,
      datum: m.datum,
      status: m.status,
      heimName: m.heimName,
      gastName: m.gastName,
      heimTeamId: m.heimTeamId,
      gastTeamId: m.gastTeamId,
      ergebnisHeim: m.ergebnisHeim,
      ergebnisGast: m.ergebnisGast,
      ownSide: resolveTeamSide(m, team.fussballdeTeamId, names),
      ownSideReliable:
        idDecided || !matchHasNameCollision(names, m.heimName, m.gastName)
    };
  });
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
 *
 * `cancelled` fällt raus — dieselbe Regel wie in getNextMatchForTeam, nur hier
 * genauso nötig: ein abgesagtes Spiel ist nicht „gespielt" und landete sonst in
 * der VORSCHAU-Vorlage („NÄCHSTES SPIEL"). Abgesagte Rows sind zusätzlich
 * Tombstones ersetzter Spiele (cancelledReason "match_updated") — eine gemerkte
 * Vorschau-URL kündigte damit ein Spiel an, das es nicht mehr gibt.
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
    .where(
      and(
        eq(matches.id, matchId),
        eq(matches.teamId, teamId),
        ne(matches.status, "cancelled")
      )
    )
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
 * Wappen des Gegners — dieselbe SINGLE SOURCE OF TRUTH wie überall sonst: pro
 * Mannschaft gilt genau EIN Wappen, und es ist dasselbe, egal ob die Mannschaft
 * gerade das eigene Team oder der Gegner ist. Für KickPact-Mannschaften ist das
 * `teams.logoUrl` (hochgeladen ODER per Crawl aus dem Crest-Cache gesetzt), das
 * jede Anzeigefläche ohnehin schon liest.
 *
 *   1) Hat der Gegner eine KickPact-Mannschaft mit gesetztem `teams.logoUrl`,
 *      gilt DAS — ohne Gate. Ändert der Gegner sein Wappen (Upload), zieht der
 *      nächste Post automatisch das neue (Johannes' Vorgabe: Wiesloch ↔
 *      Dossenheim). Bewusste Produkt-Entscheidung: das Vereinswappen ist im
 *      Kontext eines realen Spiels öffentlich, deshalb KEINE discoverable-/
 *      verified-Sperre mehr (früher gated — 2026-07-20 abgeschafft).
 *   2) Sonst das gescrapte fussball.de-Wappen aus dem Crest-Cache. Die
 *      allermeisten Gegner sind gar keine KickPact-Mannschaft und hätten sonst
 *      dauerhaft nur ein Namens-Kürzel im Bild.
 *
 * Verknüpft wird über die eindeutige fussball.de-team-id, nicht über den Namen
 * (Namens-Matching kollidiert bei Reserve-Derbys/gleicher Stadt). Eindeutig ist
 * aber nur (fussballde_team_id, saison) — über die Saisons hinweg gibt es also
 * mehrere Zeilen. Deshalb die NEUESTE mit gesetztem Wappen nehmen.
 */
export async function getOpponentLogoUrl(
  fussballdeTeamId: string | null
): Promise<string | null> {
  if (!fussballdeTeamId) return null;
  const [row] = await db
    .select({ logoUrl: teams.logoUrl })
    .from(teams)
    .where(and(eq(teams.fussballdeTeamId, fussballdeTeamId), isNotNull(teams.logoUrl)))
    .orderBy(desc(teams.saison))
    .limit(1);
  if (row?.logoUrl) return row.logoUrl;
  // Keine KickPact-Mannschaft mit eigenem Wappen → gescraptes fussball.de-Wappen.
  return getClubCrestLogoUrl(fussballdeTeamId);
}
