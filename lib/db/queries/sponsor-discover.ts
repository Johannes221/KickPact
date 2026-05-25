import { and, eq, ilike, or, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs, sponsorInquiries } from "@/lib/db/schema";

export interface DiscoverableTeam {
  teamId: string;
  teamName: string;
  saison: string;
  clubId: string;
  clubName: string;
  clubOrt: string | null;
  publicTagline: string | null;
  hasOpenInquiry: boolean;
  clubVerifiedAt: Date | null;
}

/**
 * Listet alle "discoverable" Mannschaften, optional gefiltert nach Suchbegriff
 * (Mannschafts- oder Vereinsname oder Ort). hasOpenInquiry markiert ob der
 * eingeloggte User schon eine Anfrage gestellt hat.
 */
export async function listDiscoverableTeams(opts: {
  search?: string;
  sponsorUserId?: string;
  limit?: number;
}): Promise<DiscoverableTeam[]> {
  const search = opts.search?.trim();
  const conditions = [eq(teams.discoverable, true), eq(teams.isActive, true)];

  if (search && search.length >= 2) {
    const like = `%${search}%`;
    const orClause = or(
      ilike(teams.name, like),
      ilike(clubs.name, like),
      ilike(clubs.ort, like)
    );
    if (orClause) {
      conditions.push(orClause);
    }
  }

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      saison: teams.saison,
      clubId: clubs.id,
      clubName: clubs.name,
      clubOrt: clubs.ort,
      clubVerifiedAt: clubs.verifiedAt,
      publicTagline: teams.publicTagline,
      hasInquiry: opts.sponsorUserId
        ? sql<boolean>`EXISTS (
            SELECT 1 FROM ${sponsorInquiries}
            WHERE ${sponsorInquiries.teamId} = ${teams.id}
              AND ${sponsorInquiries.sponsorUserId} = ${opts.sponsorUserId}
              AND ${sponsorInquiries.status} IN ('pending', 'accepted')
          )`
        : sql<boolean>`false`
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(...conditions))
    .orderBy(desc(teams.createdAt))
    .limit(opts.limit ?? 50);

  return rows.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    saison: r.saison,
    clubId: r.clubId,
    clubName: r.clubName,
    clubOrt: r.clubOrt,
    publicTagline: r.publicTagline,
    hasOpenInquiry: Boolean(r.hasInquiry),
    clubVerifiedAt: r.clubVerifiedAt
  }));
}

/**
 * Alle Anfragen für eine bestimmte Mannschaft (Admin-Sicht).
 */
export async function listInquiriesForTeam(teamId: string) {
  return db
    .select()
    .from(sponsorInquiries)
    .where(eq(sponsorInquiries.teamId, teamId))
    .orderBy(desc(sponsorInquiries.createdAt));
}

/**
 * Alle Anfragen eines Sponsors über alle Mannschaften (Sponsor-Sicht).
 */
export async function listInquiriesForSponsor(sponsorUserId: string) {
  return db
    .select({
      id: sponsorInquiries.id,
      teamId: sponsorInquiries.teamId,
      teamName: teams.name,
      clubName: clubs.name,
      status: sponsorInquiries.status,
      message: sponsorInquiries.message,
      responseMessage: sponsorInquiries.responseMessage,
      createdAt: sponsorInquiries.createdAt,
      respondedAt: sponsorInquiries.respondedAt
    })
    .from(sponsorInquiries)
    .innerJoin(teams, eq(sponsorInquiries.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(sponsorInquiries.sponsorUserId, sponsorUserId))
    .orderBy(desc(sponsorInquiries.createdAt));
}
