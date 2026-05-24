import { eq, and, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  matches,
  matchEvents,
  players
} from "@/lib/db/schema";
import type { SpielDetails, SpielListItem } from "@/lib/crawler/fussballde";

export interface ActiveTeam {
  id: string;
  name: string;
  clubId: string;
  fussballdeTeamId: string;
  fussballdeSlug: string;
  saison: string;
}

export async function getActiveTeams(): Promise<ActiveTeam[]> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      clubId: teams.clubId,
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
      saison: teams.saison
    })
    .from(teams)
    .where(eq(teams.isActive, true));
  return rows
    .filter((r) => r.fussballdeTeamId !== null && r.fussballdeSlug !== null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      clubId: r.clubId,
      fussballdeTeamId: r.fussballdeTeamId!,
      fussballdeSlug: r.fussballdeSlug!,
      saison: r.saison
    }));
}

// ---------------------------------------------------------------------------
// Result verification helpers
// ---------------------------------------------------------------------------

export interface StoredMatch {
  id: string;
  fussballdeSpielId: string;
  heimName: string;
  gastName: string;
  datum: Date;
  ergebnisHeim: number;
  ergebnisGast: number;
}

/** Returns the N most recent matches that already have a final score stored. */
export async function getRecentFinishedMatches(
  teamId: string,
  limit = 3
): Promise<StoredMatch[]> {
  const rows = await db
    .select({
      id: matches.id,
      fussballdeSpielId: matches.fussballdeSpielId,
      heimName: matches.heimName,
      gastName: matches.gastName,
      datum: matches.datum,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(matches)
    .where(
      and(
        eq(matches.teamId, teamId),
        isNotNull(matches.ergebnisHeim),
        isNotNull(matches.ergebnisGast)
      )
    )
    .orderBy(desc(matches.datum))
    .limit(limit);
  // isNotNull guarantees non-null at runtime; narrow the type here
  return rows.filter(
    (r): r is StoredMatch =>
      r.ergebnisHeim !== null && r.ergebnisGast !== null
  );
}

export async function getActiveTeamById(teamId: string): Promise<ActiveTeam | null> {
  const [row] = await db
    .select({
      id: teams.id,
      name: teams.name,
      clubId: teams.clubId,
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
      saison: teams.saison,
      isActive: teams.isActive
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row || !row.isActive || !row.fussballdeTeamId || !row.fussballdeSlug) return null;
  return {
    id: row.id,
    name: row.name,
    clubId: row.clubId,
    fussballdeTeamId: row.fussballdeTeamId,
    fussballdeSlug: row.fussballdeSlug,
    saison: row.saison
  };
}

export async function findMatchByFussballdeId(
  fussballdeSpielId: string
): Promise<{ id: string; contentHash: string | null } | null> {
  const [m] = await db
    .select({ id: matches.id, contentHash: matches.contentHash })
    .from(matches)
    .where(eq(matches.fussballdeSpielId, fussballdeSpielId))
    .limit(1);
  return m ?? null;
}

function parseDateDdMmYyyy(s: string): Date {
  const [dd, mm, yy] = s.split(".");
  // fussball.de liefert manchmal 2-stellige Jahre ("10.05.26" statt "10.05.2026")
  const yyyy = yy.length === 2 ? "20" + yy : yy;
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
}

export async function insertMatchWithEvents(args: {
  teamId: string;
  listItem: SpielListItem;
  details: SpielDetails;
  contentHash?: string;
}): Promise<{ matchId: string; newEventCount: number }> {
  const { teamId, listItem, details, contentHash } = args;

  const [matchRow] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: details.spielId,
      datum: parseDateDdMmYyyy(listItem.datum),
      heimName: details.heim || listItem.heim,
      gastName: details.gast || listItem.gast,
      ergebnisHeim: details.ergebnis.heim,
      ergebnisGast: details.ergebnis.gast,
      halbzeitHeim: details.halbzeit?.heim ?? null,
      halbzeitGast: details.halbzeit?.gast ?? null,
      status: "finished",
      contentHash: contentHash ?? null
    })
    .returning({ id: matches.id });

  if (!matchRow) throw new Error("insertMatch failed");

  const newEventCount = await writeMatchEvents(matchRow.id, teamId, details);
  return { matchId: matchRow.id, newEventCount };
}

/**
 * Re-imports a previously-scraped match after fussball.de data changed.
 *
 * Deletes the old `match_events` rows (cascade will not touch `charges`
 * because we want the existing-but-cancelled charge audit trail to survive),
 * updates the parent `matches` row with the new score / halftime / contentHash,
 * then re-inserts events from the fresh scrape.
 *
 * Callers MUST first invoke `invalidateChargesForMatch` so downstream
 * evaluators don't see double-counted events.
 */
export async function updateMatchWithEvents(args: {
  matchId: string;
  teamId: string;
  listItem: SpielListItem;
  details: SpielDetails;
  contentHash: string;
}): Promise<{ matchId: string; newEventCount: number }> {
  const { matchId, teamId, listItem, details, contentHash } = args;

  // Remove old events; new ones get re-inserted below.
  await db.delete(matchEvents).where(eq(matchEvents.matchId, matchId));

  await db
    .update(matches)
    .set({
      datum: parseDateDdMmYyyy(listItem.datum),
      heimName: details.heim || listItem.heim,
      gastName: details.gast || listItem.gast,
      ergebnisHeim: details.ergebnis.heim,
      ergebnisGast: details.ergebnis.gast,
      halbzeitHeim: details.halbzeit?.heim ?? null,
      halbzeitGast: details.halbzeit?.gast ?? null,
      status: "finished",
      contentHash
    })
    .where(eq(matches.id, matchId));

  const newEventCount = await writeMatchEvents(matchId, teamId, details);
  return { matchId, newEventCount };
}

async function writeMatchEvents(
  matchId: string,
  teamId: string,
  details: SpielDetails
): Promise<number> {
  let newEventCount = 0;
  for (const ev of details.events) {
    if (ev.typ === "TOR" && ev.spielerId) {
      const playerId = await upsertPlayer(
        teamId,
        ev.spielerId,
        ev.spielerName ?? ev.spielerId
      );
      await db.insert(matchEvents).values({
        matchId,
        minute: ev.minute,
        type: "tor",
        side: ev.side === "unbekannt" ? "heim" : ev.side,
        playerName: ev.spielerName,
        playerId: playerId ?? undefined,
        source: "scraped"
      });
      newEventCount++;
    } else if (ev.typ === "AUSWECHSLUNG" && ev.rein && ev.raus) {
      const reinId = await upsertPlayer(teamId, ev.rein.id, ev.rein.name);
      await db.insert(matchEvents).values({
        matchId,
        minute: ev.minute,
        type: "auswechslung",
        subtype: "ein",
        side: ev.side === "unbekannt" ? "heim" : ev.side,
        playerName: ev.rein.name,
        playerId: reinId ?? undefined,
        source: "scraped"
      });
      const rausId = await upsertPlayer(teamId, ev.raus.id, ev.raus.name);
      await db.insert(matchEvents).values({
        matchId,
        minute: ev.minute,
        type: "auswechslung",
        subtype: "aus",
        side: ev.side === "unbekannt" ? "heim" : ev.side,
        playerName: ev.raus.name,
        playerId: rausId ?? undefined,
        source: "scraped"
      });
      newEventCount += 2;
    }
  }
  return newEventCount;
}

async function upsertPlayer(
  teamId: string,
  fussballdeId: string,
  name: string
): Promise<string | null> {
  // Leere IDs überspringen (passiert wenn fussball.de kein Player-Profil hat)
  if (!fussballdeId) return null;

  const [existing] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.fussballdePlayerId, fussballdeId)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(players)
    .values({ teamId, fussballdePlayerId: fussballdeId, name })
    .returning({ id: players.id });
  return created.id;
}
