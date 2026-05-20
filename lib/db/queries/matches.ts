import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, clubs } from "@/lib/db/schema";

export async function getMatchById(matchId: string, clubSlug: string) {
  const [row] = await db
    .select({
      match: matches,
      team: teams,
      club: clubs
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(matches.id, matchId), eq(clubs.slug, clubSlug)))
    .limit(1);
  return row ?? null;
}

export async function listMatchEvents(matchId: string) {
  return db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(matchEvents.minute);
}

export async function listMatchesForTeam(teamId: string, limit = 20) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.teamId, teamId))
    .orderBy(desc(matches.datum))
    .limit(limit);
}
