import { eq, and } from "drizzle-orm";
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
  clubId: string;
  fussballdeTeamId: string;
  fussballdeSlug: string;
  saison: string;
}

export async function getActiveTeams(): Promise<ActiveTeam[]> {
  const rows = await db
    .select({
      id: teams.id,
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
      clubId: r.clubId,
      fussballdeTeamId: r.fussballdeTeamId!,
      fussballdeSlug: r.fussballdeSlug!,
      saison: r.saison
    }));
}

export async function findMatchByFussballdeId(
  fussballdeSpielId: string
): Promise<{ id: string } | null> {
  const [m] = await db
    .select({ id: matches.id })
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
}): Promise<{ matchId: string; newEventCount: number }> {
  const { teamId, listItem, details } = args;

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
      status: "finished"
    })
    .returning({ id: matches.id });

  if (!matchRow) throw new Error("insertMatch failed");

  let newEventCount = 0;
  for (const ev of details.events) {
    if (ev.typ === "TOR" && ev.spielerId) {
      const playerId = await upsertPlayer(
        teamId,
        ev.spielerId,
        ev.spielerName ?? ev.spielerId
      );
      await db.insert(matchEvents).values({
        matchId: matchRow.id,
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
        matchId: matchRow.id,
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
        matchId: matchRow.id,
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

  return { matchId: matchRow.id, newEventCount };
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
