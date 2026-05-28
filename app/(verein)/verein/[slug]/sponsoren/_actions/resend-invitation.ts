"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { sponsorInvitations } from "@/lib/db/schema/invitations";
import { teams } from "@/lib/db/schema/clubs";

const inputSchema = z.object({
  clubSlug: z.string().min(1),
  invitationId: z.string().min(1)
});

/**
 * Erneuert eine ausstehende Sponsor-Einladung:
 * - Generiert einen neuen Token
 * - Verlängert expiresAt um 7 Tage
 * - Revokiert die alte Einladung und legt eine neue an
 *
 * Tenant-Check: Einladung muss via team.clubId zu diesem Club gehören.
 */
export async function resendInvitationAction(input: {
  clubSlug: string;
  invitationId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };

  const { club } = await assertClubWriteAccess(parsed.data.clubSlug, "admin");

  // Tenant-check + load
  const [existing] = await db
    .select({
      id: sponsorInvitations.id,
      teamId: sponsorInvitations.teamId,
      createdByUserId: sponsorInvitations.createdByUserId,
      recipientName: sponsorInvitations.recipientName,
      teamClubId: teams.clubId
    })
    .from(sponsorInvitations)
    .innerJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .where(
      and(
        eq(sponsorInvitations.id, parsed.data.invitationId),
        eq(sponsorInvitations.kind, "sponsor"),
        eq(sponsorInvitations.status, "pending")
      )
    )
    .limit(1);

  if (!existing || existing.teamClubId !== club.id) {
    return { ok: false, error: "Einladung nicht gefunden oder nicht autorisiert" };
  }

  // Revoke old token
  await db
    .update(sponsorInvitations)
    .set({ status: "revoked" })
    .where(eq(sponsorInvitations.id, existing.id));

  // Create fresh invitation with 7-day extension
  const newToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(sponsorInvitations).values({
    kind: "sponsor",
    teamId: existing.teamId,
    createdByUserId: existing.createdByUserId,
    recipientName: existing.recipientName,
    token: newToken,
    expiresAt
  });

  revalidatePath(`/verein/${parsed.data.clubSlug}/sponsoren`);
  return { ok: true };
}
