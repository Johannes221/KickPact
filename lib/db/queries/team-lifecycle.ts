import { eq, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import { matchEvents } from "@/lib/db/schema/matches";

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
