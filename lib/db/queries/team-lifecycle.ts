import { and, eq, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { players, teams, seasonResults } from "@/lib/db/schema";
import { matchEvents } from "@/lib/db/schema/matches";
import { prevSaisonCode, saisonStartDate } from "@/lib/utils/saison";

export type RosterPlayer = {
  id: string;
  name: string;
  blocked: boolean;
  matchEventCount: number;
};

/**
 * Lädt alle Spieler eines Teams inkl. Match-Event-Count (für UI-Sortierung
 * und um Trainern zu zeigen "der Spieler hat Events").
 *
 * Sortierung: blockierte Spieler nach unten, dann nach Name.
 *
 * Implementiert als zwei Queries (players + grouped events) statt
 * korrelierter Subquery, damit der Query-Plan stabil ist und die
 * `match_events.player_id`-Spalten-Referenz nicht via Drizzle-Interpolation
 * fehlschlagen kann.
 */
export async function listRosterForTeam(teamId: string): Promise<RosterPlayer[]> {
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      blocked: players.blocked
    })
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(players.blocked, players.name);

  if (rows.length === 0) return [];

  const playerIds = rows.map((r) => r.id);
  const eventRows = await db
    .select({
      playerId: matchEvents.playerId,
      n: sql<number>`count(*)::int`
    })
    .from(matchEvents)
    .where(inArray(matchEvents.playerId, playerIds))
    .groupBy(matchEvents.playerId);

  const counts = new Map(
    eventRows
      .filter((r): r is { playerId: string; n: number } => r.playerId !== null)
      .map((r) => [r.playerId, Number(r.n)])
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    blocked: r.blocked,
    matchEventCount: counts.get(r.id) ?? 0
  }));
}

/**
 * Mannschaft (id/name/verifiedAt) scoped auf einen Club — der Standard-Lookup
 * für Team-Scope-Seiten. `undefined`, wenn das Team nicht zu diesem Club gehört.
 */
export async function getTeamInClub(teamId: string, clubId: string) {
  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      verifiedAt: teams.verifiedAt,
      isActive: teams.isActive,
      saison: teams.saison
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, clubId)))
    .limit(1);
  return team;
}

/** Manuell gesetztes Saison-Ergebnis einer Mannschaft (oder undefined). */
export async function getSeasonResultForTeam(teamId: string, saison: string) {
  const [row] = await db
    .select()
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, teamId), eq(seasonResults.saison, saison)))
    .limit(1);
  return row;
}

export type SeasonResultRow = Awaited<ReturnType<typeof getSeasonResultForTeam>>;

/**
 * Welche Saison soll das Saison-Ergebnis-Formular bedienen? (Review K2 2026-06-11)
 *
 * Nach dem Saison-Bump (15.7.) zeigt `team.saison` bereits die NEUE Saison —
 * das abzuschließende Ergebnis gehört aber zur VORSAISON. Würde das Formular
 * stumpf an `team.saison` binden, schriebe ein Juli-Eintrag das Ergebnis auf
 * die neue Saison; evaluate-season fände keine alten Saison-Pacts mehr (deren
 * endsAt liegt vor dem neuen Saisonfenster) → 0 Charges, ohne Fehler.
 *
 * Regel: Fehlt das Ergebnis der aktuellen Saison UND das der Vorsaison, und
 * die aktuelle Saison ist jung (zwischen Saisonstart und 1.10.), dann bedient
 * das Formular die Vorsaison. Sonst die aktuelle Saison.
 */
export async function resolveSeasonResultTarget(
  teamId: string,
  teamSaison: string,
  now: Date = new Date()
): Promise<{ saison: string; result: SeasonResultRow | null }> {
  const current = await getSeasonResultForTeam(teamId, teamSaison);
  if (current) return { saison: teamSaison, result: current };

  const prev = prevSaisonCode(teamSaison);
  const seasonStart = saisonStartDate(teamSaison);
  if (prev && seasonStart) {
    const graceEnd = new Date(seasonStart.getFullYear(), 9, 1); // 1. Oktober
    if (now >= seasonStart && now < graceEnd) {
      const prevResult = await getSeasonResultForTeam(teamId, prev);
      if (!prevResult) return { saison: prev, result: null };
    }
  }
  return { saison: teamSaison, result: null };
}

/** Vollständige Team-Row, club-scoped (Team-Detail-Dashboard). undefined wenn fremd. */
export async function getFullTeamInClub(teamId: string, clubId: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, clubId)))
    .limit(1);
  return team;
}

/** Nur der Anzeigename einer Mannschaft (Team-Layout-Header), ungescoped. */
export async function getTeamNameById(teamId: string): Promise<string | null> {
  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return team?.name ?? null;
}

/** Basis-Felder (id/name/clubId) einer Mannschaft per ID, ungescoped. */
export async function getTeamBasicById(teamId: string) {
  const [team] = await db
    .select({ id: teams.id, name: teams.name, clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return team;
}

/** Felder für den „Mein Profil"-Editor (Cover/Logo/Public-Profil), club-scoped. */
export async function getTeamProfileForEditor(teamId: string, clubId: string) {
  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      league: teams.league,
      discoverable: teams.discoverable,
      publicSlug: teams.publicSlug,
      publicName: teams.publicName,
      publicTagline: teams.publicTagline,
      publicGoals: teams.publicGoals,
      logoUrl: teams.logoUrl,
      coverUrl: teams.coverUrl,
      showInsights: teams.showInsights,
      verifiedAt: teams.verifiedAt
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, clubId)))
    .limit(1);
  return team;
}
