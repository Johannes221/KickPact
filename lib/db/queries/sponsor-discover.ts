import { and, eq, ilike, isNotNull, or, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs, sponsorInquiries, seasonResults } from "@/lib/db/schema";
import { listTeamImages } from "./team-images";

export interface DiscoverableTeam {
  teamId: string;
  teamName: string;
  saison: string;
  league: string | null;
  clubId: string;
  clubName: string;
  clubOrt: string | null;
  publicSlug: string | null;
  publicTagline: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  lastSeasonPosition: number | null;
  lastSeasonPromoted: boolean;
  hasOpenInquiry: boolean;
  clubVerifiedAt: Date | null;
}

/**
 * Listet alle "discoverable" Mannschaften, optional gefiltert nach Suchbegriff
 * (Mannschafts- oder Vereinsname oder Ort), Liga und Ort. Nur verifizierte
 * Mannschaften (teams.verifiedAt IS NOT NULL) sind auffindbar.
 * hasOpenInquiry markiert ob der eingeloggte User schon eine Anfrage gestellt hat.
 */
export async function listDiscoverableTeams(opts: {
  search?: string;
  league?: string;
  ort?: string;
  sponsorUserId?: string;
  limit?: number;
}): Promise<DiscoverableTeam[]> {
  const search = opts.search?.trim();
  const conditions = [
    eq(teams.discoverable, true),
    eq(teams.isActive, true),
    isNotNull(teams.verifiedAt) // Gate: nur verifizierte sind auffindbar
  ];

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

  if (opts.league?.trim()) {
    conditions.push(eq(teams.league, opts.league.trim()));
  }

  if (opts.ort?.trim()) {
    conditions.push(eq(clubs.ort, opts.ort.trim()));
  }

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      saison: teams.saison,
      league: teams.league,
      clubId: clubs.id,
      clubName: clubs.name,
      clubOrt: clubs.ort,
      clubVerifiedAt: clubs.verifiedAt,
      publicSlug: teams.publicSlug,
      publicTagline: teams.publicTagline,
      coverUrlRaw: teams.coverUrl,
      logoUrlRaw: teams.logoUrl,
      lastSeasonPosition: sql<number | null>`(
        SELECT sr.final_position FROM ${seasonResults} sr
        WHERE sr.team_id = ${teams.id} AND sr.saison <> ${teams.saison}
        ORDER BY sr.saison DESC LIMIT 1)`,
      lastSeasonPromoted: sql<boolean>`COALESCE((
        SELECT sr.promoted FROM ${seasonResults} sr
        WHERE sr.team_id = ${teams.id} AND sr.saison <> ${teams.saison}
        ORDER BY sr.saison DESC LIMIT 1), false)`,
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
    league: r.league,
    clubId: r.clubId,
    clubName: r.clubName,
    clubOrt: r.clubOrt,
    publicSlug: r.publicSlug,
    publicTagline: r.publicTagline,
    coverUrl: r.coverUrlRaw ? `/api/teams/${r.teamId}/image?slot=cover` : null,
    logoUrl: r.logoUrlRaw ? `/api/teams/${r.teamId}/image?slot=logo` : null,
    lastSeasonPosition: r.lastSeasonPosition ?? null,
    lastSeasonPromoted: Boolean(r.lastSeasonPromoted),
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
  /** Serve-Endpoint-URL für das Logo oder null. */
  logoUrl: string | null;
  /** Liga-Bezeichnung aus dem Crawler oder null. */
  league: string | null;
  /** Ob Saison-Insights auf dem öffentlichen Profil angezeigt werden. */
  showInsights: boolean;
  /** Serve-Endpoint-URL für das Cover-Bild oder null. */
  coverUrl: string | null;
  /** Galerie-Bilder (max. 8) als Serve-Endpoint-URLs. */
  gallery: { id: string; url: string }[];
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
      coverUrl: teams.coverUrl,
      league: teams.league,
      showInsights: teams.showInsights,
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
  if (!row.teamVerifiedAt) return null; // Gate: nur verifizierte Teams sind öffentlich sichtbar

  const logoUrl = row.logoUrl ? `/api/teams/${row.teamId}/image?slot=logo` : null;
  const coverUrl = row.coverUrl ? `/api/teams/${row.teamId}/image?slot=cover` : null;
  const gallery = (await listTeamImages(row.teamId)).map((g) => ({
    id: g.id,
    url: `/api/teams/${row.teamId}/image?slot=gallery&id=${g.id}`
  }));

  return {
    teamId: row.teamId,
    publicSlug: row.publicSlug,
    displayName: row.publicName?.trim() || row.teamName,
    teamName: row.teamName,
    saison: row.saison,
    tagline: row.tagline,
    goals: row.goals,
    logoUrl,
    league: row.league,
    showInsights: row.showInsights,
    coverUrl,
    gallery,
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
