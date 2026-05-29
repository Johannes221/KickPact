"use server";

import { eq, and, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { clubs, clubVerifications, subscriptions, teams } from "@/lib/db/schema";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import {
  updateClubMasterData,
  manualVerifyClub,
  manualVerifyTeam,
  resumeSubscription,
  updateTeam
} from "@/lib/db/queries/club-admin";
import {
  releaseWithheldInvoicesForClub,
  releaseWithheldInvoicesForTeam
} from "@/lib/db/queries/verifications";

/**
 * Admin-Aktionen für einen Verein.
 *
 *  - pauseSubscription   : status='paused' bis manuell wieder aktiviert.
 *  - revokeVerification  : alle approved-Verifications dieses Clubs auf 'revoked',
 *                          clubs.verifiedAt = NULL. Verein wird Banner sehen müssen
 *                          und neu hochladen.
 *  - blockClub           : Soft-Block via subscriptions.status='cancelled'.
 *                          Wir setzen NICHT clubs.* — Cleanup-Anonymisierung
 *                          läuft eigenständig. Operator kann später hard-delete
 *                          manuell ausführen.
 */

const slugInput = z.object({ clubSlug: z.string().min(1) });

async function loadClubBySlug(slug: string) {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  return club ?? null;
}

export async function pauseClubSubscriptionAction(input: { clubSlug: string }) {
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const club = await loadClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  await db
    .update(subscriptions)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(subscriptions.clubId, club.id));

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.subscription_pause",
    targetType: "club",
    targetId: club.id,
    summary: `Abo pausiert: ${club.name}`
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}

export async function blockClubAction(input: { clubSlug: string }) {
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const club = await loadClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  await db
    .update(subscriptions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptions.clubId, club.id));

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.block",
    targetType: "club",
    targetId: club.id,
    summary: `Verein gesperrt (Abo cancelled): ${club.name}`
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}

export async function revokeClubVerificationAction(input: { clubSlug: string }) {
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const club = await loadClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  await db.transaction(async (tx) => {
    await tx
      .update(clubVerifications)
      .set({ status: "revoked" })
      .where(
        and(
          eq(clubVerifications.clubId, club.id),
          ne(clubVerifications.status, "revoked")
        )
      );
    await tx.update(clubs).set({ verifiedAt: null }).where(eq(clubs.id, club.id));
  });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.verification_revoke",
    targetType: "club",
    targetId: club.id,
    summary: `Vereins-Verifizierung widerrufen: ${club.name}`
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  revalidatePath("/admin/verifications");
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase E: Stammdaten-Editor, manuelle Verifizierung, Abo fortsetzen, Team
// ─────────────────────────────────────────────────────────────────────────────

const updateClubSchema = z.object({
  clubSlug: z.string().min(1),
  name: z.string().min(1).max(200),
  ort: z.string().max(200).optional(),
  iban: z.string().max(40).optional(),
  taxId: z.string().max(40).optional()
});

export async function updateClubAction(input: {
  clubSlug: string;
  name: string;
  ort?: string;
  iban?: string;
  taxId?: string;
}) {
  const parsed = updateClubSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const club = await loadClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  await updateClubMasterData({
    clubId: club.id,
    name: parsed.data.name,
    ort: parsed.data.ort,
    iban: parsed.data.iban,
    taxId: parsed.data.taxId
  });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.update_master_data",
    targetType: "club",
    targetId: club.id,
    summary: `Vereins-Stammdaten bearbeitet: ${parsed.data.name}`,
    diff: { name: parsed.data.name, ort: parsed.data.ort, iban: parsed.data.iban, taxId: parsed.data.taxId }
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}

export async function manualVerifyClubAction(input: { clubSlug: string }) {
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const club = await loadClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  const { newlyVerified } = await manualVerifyClub(club.id);
  if (!newlyVerified) {
    return { ok: false as const, error: "Verein ist bereits verifiziert." };
  }
  // Konsistent zum Dokument-Approval-Flow: zurückgehaltene Rechnungen freigeben.
  const { count: releasedCount } = await releaseWithheldInvoicesForClub(club.id);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.manual_verify",
    targetType: "club",
    targetId: club.id,
    summary: `Verein manuell verifiziert (ohne Dokument): ${club.name}`,
    diff: { releasedInvoices: releasedCount }
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  revalidatePath("/admin/verifications");
  return { ok: true as const, releasedCount };
}

export async function resumeSubscriptionAction(input: { clubSlug: string }) {
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const club = await loadClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  await resumeSubscription(club.id);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.subscription_resume",
    targetType: "club",
    targetId: club.id,
    summary: `Abo fortgesetzt (status=active): ${club.name}`
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}

async function loadTeamForClub(teamId: string) {
  const [row] = await db
    .select({ id: teams.id, name: teams.name, clubId: teams.clubId, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(eq(teams.id, teamId))
    .limit(1);
  return row ?? null;
}

const updateTeamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  discoverable: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export async function updateTeamAction(input: {
  teamId: string;
  name?: string;
  discoverable?: boolean;
  isActive?: boolean;
}) {
  const parsed = updateTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const team = await loadTeamForClub(parsed.data.teamId);
  if (!team) return { ok: false as const, error: "Team nicht gefunden" };

  await updateTeam(parsed.data);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "team.update",
    targetType: "team",
    targetId: team.id,
    summary: `Team bearbeitet: ${parsed.data.name ?? team.name}`,
    diff: {
      name: parsed.data.name,
      discoverable: parsed.data.discoverable,
      isActive: parsed.data.isActive
    }
  });

  revalidatePath(`/admin/vereine/${team.clubSlug}`);
  return { ok: true as const };
}

export async function manualVerifyTeamAction(input: { teamId: string }) {
  const parsed = z.object({ teamId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();
  const team = await loadTeamForClub(parsed.data.teamId);
  if (!team) return { ok: false as const, error: "Team nicht gefunden" };

  const { newlyVerified } = await manualVerifyTeam(team.id);
  if (!newlyVerified) {
    return { ok: false as const, error: "Team ist bereits verifiziert." };
  }
  const { count: releasedCount } = await releaseWithheldInvoicesForTeam(team.id);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "team.manual_verify",
    targetType: "team",
    targetId: team.id,
    summary: `Team manuell verifiziert (ohne Dokument): ${team.name}`,
    diff: { releasedInvoices: releasedCount }
  });

  revalidatePath(`/admin/vereine/${team.clubSlug}`);
  revalidatePath("/admin/verifications");
  return { ok: true as const, releasedCount };
}
