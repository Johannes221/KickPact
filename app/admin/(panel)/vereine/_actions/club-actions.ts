"use server";

import { eq, and, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { clubs, clubVerifications, subscriptions } from "@/lib/db/schema";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";

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
