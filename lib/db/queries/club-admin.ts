import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, subscriptions, clubMemberships } from "@/lib/db/schema";
import { generateUniqueTeamSlug } from "./team-public-slug";

function nullIfEmpty(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function updateClubMasterData(input: {
  clubId: string;
  name: string;
  ort?: string | null;
  iban?: string | null;
  taxId?: string | null;
}): Promise<void> {
  await db
    .update(clubs)
    .set({
      name: input.name.trim(),
      ort: nullIfEmpty(input.ort),
      iban: nullIfEmpty(input.iban),
      taxId: nullIfEmpty(input.taxId),
      updatedAt: new Date()
    })
    .where(eq(clubs.id, input.clubId));
}

/**
 * Setzt clubs.verifiedAt manuell (ohne Dokument-Upload) — z.B. wenn der
 * Nachweis offline/per Post kam. Idempotent: bereits verifizierte Clubs
 * werden nicht überschrieben. Gibt zurück, ob neu verifiziert wurde.
 */
export async function manualVerifyClub(clubId: string): Promise<{ newlyVerified: boolean }> {
  const [club] = await db
    .select({ verifiedAt: clubs.verifiedAt })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!club) return { newlyVerified: false };
  if (club.verifiedAt) return { newlyVerified: false };
  await db.update(clubs).set({ verifiedAt: new Date() }).where(eq(clubs.id, clubId));
  return { newlyVerified: true };
}

export async function manualVerifyTeam(teamId: string): Promise<{ newlyVerified: boolean }> {
  const [team] = await db
    .select({ verifiedAt: teams.verifiedAt })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { newlyVerified: false };
  if (team.verifiedAt) return { newlyVerified: false };
  await db.update(teams).set({ verifiedAt: new Date() }).where(eq(teams.id, teamId));
  return { newlyVerified: true };
}

/**
 * Hebt eine Pause/Sperre auf: subscriptions.status='active'. Gegenstück zu
 * pauseClubSubscriptionAction/blockClubAction.
 */
export async function resumeSubscription(clubId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: "active", pausedUntil: null, updatedAt: new Date() })
    .where(eq(subscriptions.clubId, clubId));
}

export async function updateTeam(input: {
  teamId: string;
  name?: string;
  discoverable?: boolean;
  isActive?: boolean;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.discoverable !== undefined) patch.discoverable = input.discoverable;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (Object.keys(patch).length === 0) return;

  // Beim Öffentlich-Schalten einen stabilen publicSlug sicherstellen — sonst
  // ist die Mannschaft zwar discoverable, ihr öffentliches Profil (/m/{slug})
  // aber nicht erreichbar und "Profil ansehen" bleibt deaktiviert. Konsistent
  // zu setTeamDiscoverable/saveTeamPublicProfile, die das ebenfalls tun.
  if (input.discoverable === true) {
    const [row] = await db
      .select({
        publicSlug: teams.publicSlug,
        teamName: teams.name,
        clubName: clubs.name
      })
      .from(teams)
      .innerJoin(clubs, eq(clubs.id, teams.clubId))
      .where(eq(teams.id, input.teamId))
      .limit(1);
    if (row && !row.publicSlug) {
      patch.publicSlug = await generateUniqueTeamSlug(
        row.clubName,
        row.teamName,
        input.teamId
      );
    }
  }

  await db.update(teams).set(patch).where(eq(teams.id, input.teamId));
}

/**
 * Alle Vereine (slug + name), in denen der User Mitglied ist — für die
 * kontextabhängige Navigation (HeaderUserMenu).
 */
export async function listClubsForUser(
  userId: string
): Promise<Array<{ id: string; slug: string; name: string }>> {
  return db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
    .where(eq(clubMemberships.userId, userId));
}

/**
 * Club + (linke) Subscription per Slug — für die Stripe-Admin-Ops (Trial
 * verlängern / Refund). Liefert null, wenn der Verein nicht existiert.
 */
export async function getClubWithSubscriptionBySlug(slug: string) {
  const [row] = await db
    .select({
      clubId: clubs.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId
    })
    .from(clubs)
    .leftJoin(subscriptions, eq(subscriptions.clubId, clubs.id))
    .where(eq(clubs.slug, slug))
    .limit(1);
  return row ?? null;
}

/** Spiegelt eine via Stripe verlängerte Trial lokal (Webhook bestätigt später). */
export async function setSubscriptionTrialEnd(clubId: string, trialEnd: Date): Promise<void> {
  await db
    .update(subscriptions)
    .set({ trialEndsAt: trialEnd, status: "trialing", updatedAt: new Date() })
    .where(eq(subscriptions.clubId, clubId));
}

/** Setzt den Abo-Status eines Clubs (Operator-Aktionen: pausieren / sperren). */
export async function setSubscriptionStatus(
  clubId: string,
  status: NonNullable<typeof subscriptions.$inferSelect["status"]>
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.clubId, clubId));
}

/** Team-Eckdaten inkl. Club-Slug (für die Admin-Team-Aktionen), oder null. */
export async function getTeamWithClubSlug(teamId: string) {
  const [row] = await db
    .select({ id: teams.id, name: teams.name, clubId: teams.clubId, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(eq(teams.id, teamId))
    .limit(1);
  return row ?? null;
}

/** Vollständige Club-Row per Slug (oder undefined). */
export async function getClubBySlug(slug: string) {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  return club;
}

/** Vollständige Club-Row per ID (oder undefined). */
export async function getClubById(clubId: string) {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  return club;
}

/** Name + Ort eines Vereins (für Profil-Header). */
export async function getClubNameOrt(clubId: string) {
  const [row] = await db
    .select({ name: clubs.name, ort: clubs.ort })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return row;
}

/** Teams eines Clubs (id + fussballdeTeamId) — für den „Mannschaft hinzufügen"-Wizard. */
export async function getClubTeamsBasic(clubId: string) {
  return db
    .select({ id: teams.id, fussballdeTeamId: teams.fussballdeTeamId })
    .from(teams)
    .where(eq(teams.clubId, clubId));
}

/** Teams eines Clubs mit Status (id/name/saison/isActive), nach Name sortiert. */
export async function listClubTeamsWithStatus(clubId: string) {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      isActive: teams.isActive
    })
    .from(teams)
    .where(eq(teams.clubId, clubId))
    .orderBy(teams.name);
}
