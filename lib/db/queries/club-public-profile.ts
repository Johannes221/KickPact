import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";

/**
 * Öffentliches Vereinsprofil /v/[slug] (Phase 5 Paket C, Spec §1.8).
 *
 * Sichtbarkeits-Gate: `clubs.verifiedAt IS NOT NULL` — unverifizierte Clubs
 * sind nie öffentlich (Caller → notFound()). Die Mannschaftsliste enthält
 * ALLE aktiven Teams des Clubs (namentliche Zugehörigkeit, auch autark/
 * licensedUnder); `publicSlug` ist nur gesetzt, wenn das Team dasselbe Gate
 * erfüllt wie /m/[slug] (publicSlug + discoverable + aktiv + verifiziert) —
 * sonst null (UI rendert „Profil folgt" ohne Link).
 */
export interface PublicClubTeam {
  id: string;
  name: string;
  league: string | null;
  saison: string;
  /** /m/-Slug, wenn das Team öffentlich erreichbar ist — sonst null. */
  publicSlug: string | null;
}

export interface PublicClubProfile {
  clubId: string;
  slug: string;
  name: string;
  ort: string | null;
  descriptionMd: string | null;
  /** App-interne Bild-Route (signiert/gestreamt), nicht der Storage-Key. */
  heroUrl: string | null;
  /** Nur extern nutzbare URLs (http/https oder app-relativ) — sonst null. */
  logoUrl: string | null;
  teams: PublicClubTeam[];
}

export async function getPublicClubProfileBySlug(
  slug: string
): Promise<PublicClubProfile | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const [club] = await db
    .select({
      id: clubs.id,
      slug: clubs.slug,
      name: clubs.name,
      ort: clubs.ort,
      descriptionMd: clubs.descriptionMd,
      heroUrl: clubs.heroUrl,
      logoUrl: clubs.logoUrl,
      verifiedAt: clubs.verifiedAt
    })
    .from(clubs)
    .where(eq(clubs.slug, trimmed))
    .limit(1);

  if (!club || !club.verifiedAt) return null;

  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      league: teams.league,
      saison: teams.saison,
      publicSlug: teams.publicSlug,
      discoverable: teams.discoverable,
      teamVerifiedAt: teams.verifiedAt
    })
    .from(teams)
    .where(and(eq(teams.clubId, club.id), eq(teams.isActive, true)))
    .orderBy(asc(teams.name));

  return {
    clubId: club.id,
    slug: club.slug,
    name: club.name,
    ort: club.ort,
    descriptionMd: club.descriptionMd,
    heroUrl: club.heroUrl ? `/api/clubs/${club.id}/hero` : null,
    // clubs.logoUrl ist (Stand heute) eine plain URL oder leer — Storage-Keys
    // würden im <img> brechen, daher nur http(s)/relative URLs durchlassen.
    logoUrl:
      club.logoUrl && /^(https?:\/\/|\/)/.test(club.logoUrl) ? club.logoUrl : null,
    teams: teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      league: t.league,
      saison: t.saison,
      // Gleiche Bedingungen wie getPublicTeamProfileBySlug (sonst 404-Link).
      publicSlug:
        t.publicSlug && t.discoverable && t.teamVerifiedAt ? t.publicSlug : null
    }))
  };
}

/** Storage-Key des Hero-Bilds (für den Bild-Route-Handler), oder null. */
export async function getClubHeroKey(clubId: string): Promise<string | null> {
  const [row] = await db
    .select({ heroUrl: clubs.heroUrl })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return row?.heroUrl ?? null;
}

/**
 * Slugs aller verifizierten Vereine — für die Sitemap (/v/<slug>,
 * production-gated wie /m/). Spiegelt exakt das Gate von
 * `getPublicClubProfileBySlug`.
 */
export async function listVerifiedClubSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: clubs.slug })
    .from(clubs)
    .where(isNotNull(clubs.verifiedAt));
  return rows.map((r) => r.slug);
}
