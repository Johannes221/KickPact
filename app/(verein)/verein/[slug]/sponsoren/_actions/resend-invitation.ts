"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { resendSponsorInvitation } from "@/lib/db/queries/invitations";

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

  const ok = await resendSponsorInvitation({
    invitationId: parsed.data.invitationId,
    clubId: club.id
  });
  if (!ok) {
    return { ok: false, error: "Einladung nicht gefunden oder nicht autorisiert" };
  }

  revalidatePath(`/verein/${parsed.data.clubSlug}/sponsoren`);
  return { ok: true };
}
