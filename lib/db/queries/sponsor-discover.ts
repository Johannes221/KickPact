import { and, eq, ilike, isNotNull, or, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  clubs,
  sponsorInquiries,
  sponsorInvitations,
  sponsors,
  pledges,
  seasonResults
} from "@/lib/db/schema";
import { listTeamImages } from "./team-images";
import { isPlausibleLeague } from "@/lib/utils/league";

/**
 * Beziehung des eingeloggten Sponsors zu einer Mannschaft — treibt die CTA auf
 * der Discover-Karte:
 * - `none`       → noch keine (offene) Anfrage → "Anfragen"
 * - `pending`    → Anfrage gestellt, wartet auf Antwort → "Angefragt" (disabled)
 * - `accepted`   → angenommen, aber noch kein Pledge → "Jetzt sponsern" (Token-Link)
 * - `sponsoring` → aktiver Pledge läuft → "Du sponserst" (Link zur Pledge-Übersicht)
 */
export type SponsorTeamState = "none" | "pending" | "accepted" | "sponsoring";

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
  /** Beziehung des Sponsors zu dieser Mannschaft (steuert die CTA). */
  sponsorState: SponsorTeamState;
  /**
   * Nur bei `sponsorState === "accepted"` gesetzt: gültiger Einladungs-Token,
   * mit dem der Sponsor direkt in den Pledge-Builder springt
   * (`/sponsor/pledge/new?invitation=<token>`). Null, wenn die Einladung
   * abgelaufen/zurückgezogen wurde.
   */
  pledgeInviteToken: string | null;
  clubVerifiedAt: Date | null;
}

/**
 * Kanonisches Gate für den Sponsor-Einstieg: eine Mannschaft ist nur
 * ansprechbar (Anfrage/Lead), wenn sie discoverable, aktiv UND verifiziert ist
 * — exakt die drei Bedingungen, die `listDiscoverableTeams`,
 * `getPublicTeamProfileBySlug` & Co. in SQL durchsetzen. Muss von jeder
 * Sponsor-Einstiegs-Action geprüft werden: sonst legen veraltete teamIds/Slugs
 * aus dem Client-State dangling Inquiries/Leads an und lösen Mail-Fanout an die
 * Admins unsichtbarer (deaktivierter/unverifizierter) Teams aus.
 */
export function isTeamOpenForSponsorEntry(t: {
  discoverable: boolean;
  isActive: boolean;
  verifiedAt: Date | null;
}): boolean {
  return t.discoverable && t.isActive && t.verifiedAt != null;
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
      // Läuft ein aktiver Pledge des Sponsors für dieses Team?
      hasActivePledge: opts.sponsorUserId
        ? sql<boolean>`EXISTS (
            SELECT 1 FROM ${pledges}
            INNER JOIN ${sponsors} ON ${sponsors.id} = ${pledges.sponsorId}
            WHERE ${pledges.teamId} = ${teams.id}
              AND ${sponsors.userId} = ${opts.sponsorUserId}
              AND ${pledges.status} = 'active'
          )`
        : sql<boolean>`false`,
      // Letzter Anfrage-Status des Sponsors für dieses Team (oder NULL).
      inquiryStatus: opts.sponsorUserId
        ? sql<string | null>`(
            SELECT ${sponsorInquiries.status} FROM ${sponsorInquiries}
            WHERE ${sponsorInquiries.teamId} = ${teams.id}
              AND ${sponsorInquiries.sponsorUserId} = ${opts.sponsorUserId}
            ORDER BY ${sponsorInquiries.createdAt} DESC LIMIT 1
          )`
        : sql<string | null>`NULL`,
      // Bei angenommener Anfrage: gültiger Einladungs-Token für den Pledge-Einstieg.
      inviteToken: opts.sponsorUserId
        ? sql<string | null>`(
            SELECT ${sponsorInvitations.token}
            FROM ${sponsorInquiries}
            INNER JOIN ${sponsorInvitations}
              ON ${sponsorInvitations.id} = ${sponsorInquiries.invitationId}
            WHERE ${sponsorInquiries.teamId} = ${teams.id}
              AND ${sponsorInquiries.sponsorUserId} = ${opts.sponsorUserId}
              AND ${sponsorInquiries.status} = 'accepted'
              AND ${sponsorInvitations.status} = 'pending'
              AND ${sponsorInvitations.expiresAt} > now()
            ORDER BY ${sponsorInquiries.createdAt} DESC LIMIT 1
          )`
        : sql<string | null>`NULL`
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
    sponsorState: deriveSponsorState(r.hasActivePledge, r.inquiryStatus),
    pledgeInviteToken: r.inviteToken ?? null,
    clubVerifiedAt: r.clubVerifiedAt
  }));
}

/**
 * Leitet den Sponsor-Beziehungs-Status aus aktivem Pledge + letztem
 * Anfrage-Status ab. Aktiver Pledge schlägt alles (man sponsert bereits);
 * sonst zählt nur ein noch offener (pending) oder angenommener (accepted)
 * Anfrage-Status. `rejected`/`expired` → `none` (Sponsor darf neu anfragen).
 */
export function deriveSponsorState(
  hasActivePledge: boolean | null | undefined,
  inquiryStatus: string | null | undefined
): SponsorTeamState {
  if (hasActivePledge) return "sponsoring";
  if (inquiryStatus === "accepted") return "accepted";
  if (inquiryStatus === "pending") return "pending";
  return "none";
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
  /**
   * Slug des Container-Vereins für die Querverlinkung aufs öffentliche
   * Vereinsprofil /v/[slug] — nur gesetzt, wenn der Verein verifiziert ist
   * (gleiches Gate wie getPublicClubProfileBySlug), sonst null.
   */
  clubSlug: string | null;
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
      clubSlug: clubs.slug,
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
    clubSlug: row.clubVerifiedAt ? row.clubSlug : null,
    clubVerifiedAt: row.clubVerifiedAt,
    teamVerifiedAt: row.teamVerifiedAt
  };
}

/**
 * Liefert distinkte, sortierte Ligen und Orte nur aus verifizierten,
 * aktiven und discoverable Mannschaften. Dient als Datengrundlage für
 * Filter-Dropdowns auf der Discovery-Seite.
 */
export async function listDiscoveryFacets(): Promise<{ leagues: string[]; orte: string[] }> {
  const base = and(
    eq(teams.discoverable, true),
    eq(teams.isActive, true),
    isNotNull(teams.verifiedAt)
  );

  const leagueRows = await db
    .selectDistinct({ v: teams.league })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(base, isNotNull(teams.league)));

  const orteRows = await db
    .selectDistinct({ v: clubs.ort })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(base, isNotNull(clubs.ort)));

  const clean = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter((x): x is string => !!x && x.trim().length > 0))).sort((a, b) =>
      a.localeCompare(b, "de")
    );

  return {
    // Altlasten (vor dem Liga-Parser-Fix gespeicherte Wochentage wie "So")
    // defensiv ausfiltern, bis der nächste Crawl die echte Liga schreibt.
    leagues: clean(leagueRows.map((r) => r.v)).filter(isPlausibleLeague),
    orte: clean(orteRows.map((r) => r.v))
  };
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
      respondedAt: sponsorInquiries.respondedAt,
      // Gültiger Einladungs-Token einer angenommenen Anfrage → Pledge-Einstieg.
      inviteToken: sql<string | null>`(
        SELECT ${sponsorInvitations.token} FROM ${sponsorInvitations}
        WHERE ${sponsorInvitations.id} = ${sponsorInquiries.invitationId}
          AND ${sponsorInvitations.status} = 'pending'
          AND ${sponsorInvitations.expiresAt} > now()
      )`,
      // Läuft schon ein aktiver Pledge für dieses Team? → "Du sponserst".
      hasActivePledge: sql<boolean>`EXISTS (
        SELECT 1 FROM ${pledges}
        INNER JOIN ${sponsors} ON ${sponsors.id} = ${pledges.sponsorId}
        WHERE ${pledges.teamId} = ${sponsorInquiries.teamId}
          AND ${sponsors.userId} = ${sponsorUserId}
          AND ${pledges.status} = 'active'
      )`
    })
    .from(sponsorInquiries)
    .innerJoin(teams, eq(sponsorInquiries.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(sponsorInquiries.sponsorUserId, sponsorUserId))
    .orderBy(desc(sponsorInquiries.createdAt));
}

/**
 * Alle öffentlich sichtbaren Team-Profile für die Sitemap: publicSlug gesetzt,
 * discoverable + aktiv + verifiziert — exakt die Gates, die auch
 * `getPublicTeamProfileBySlug` durchsetzt (sonst 404 ⇒ gehört nicht in die
 * Sitemap).
 */
export async function listPublicTeamSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: teams.publicSlug })
    .from(teams)
    .where(
      and(
        isNotNull(teams.publicSlug),
        eq(teams.discoverable, true),
        eq(teams.isActive, true),
        isNotNull(teams.verifiedAt)
      )
    );
  return rows.map((r) => r.slug).filter((s): s is string => !!s);
}
