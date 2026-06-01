import { and, eq, ilike, or, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs, sponsorInquiries } from "@/lib/db/schema";
import { getDocumentSignedUrl } from "@/lib/storage/documents";

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

export interface PublicTeamProfile {
  teamId: string;
  publicSlug: string;
  /** Öffentlicher Anzeigename (publicName ?? team.name). */
  displayName: string;
  teamName: string;
  saison: string;
  tagline: string | null;
  goals: string | null;
  /** Aufgelöste, anzeigbare Logo-URL (signed/served) oder null. */
  logoUrl: string | null;
  clubName: string;
  clubOrt: string | null;
  clubVerifiedAt: Date | null;
  teamVerifiedAt: Date | null;
}

/**
 * Lädt das öffentliche Profil einer Mannschaft anhand ihres `publicSlug`.
 * Gibt `null` zurück, wenn nicht gefunden, nicht `discoverable` oder nicht
 * `isActive` — die Public-Seite rendert dann `notFound()`. Privat geschaltete
 * Profile sind so nach außen unsichtbar (auch bei bekanntem Slug).
 */
export async function getPublicTeamProfileBySlug(
  slug: string
): Promise<PublicTeamProfile | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const [row] = await db
    .select({
      teamId: teams.id,
      publicSlug: teams.publicSlug,
      teamName: teams.name,
      publicName: teams.publicName,
      saison: teams.saison,
      tagline: teams.publicTagline,
      goals: teams.publicGoals,
      logoUrl: teams.logoUrl,
      discoverable: teams.discoverable,
      isActive: teams.isActive,
      teamVerifiedAt: teams.verifiedAt,
      clubName: clubs.name,
      clubOrt: clubs.ort,
      clubVerifiedAt: clubs.verifiedAt
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.publicSlug, trimmed))
    .limit(1);

  if (!row || !row.publicSlug) return null;
  if (!row.discoverable || !row.isActive) return null;

  let resolvedLogo: string | null = null;
  if (row.logoUrl) {
    try {
      resolvedLogo = await getDocumentSignedUrl(row.logoUrl, 3600);
    } catch {
      resolvedLogo = null;
    }
  }

  return {
    teamId: row.teamId,
    publicSlug: row.publicSlug,
    displayName: row.publicName?.trim() || row.teamName,
    teamName: row.teamName,
    saison: row.saison,
    tagline: row.tagline,
    goals: row.goals,
    logoUrl: resolvedLogo,
    clubName: row.clubName,
    clubOrt: row.clubOrt,
    clubVerifiedAt: row.clubVerifiedAt,
    teamVerifiedAt: row.teamVerifiedAt
  };
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
