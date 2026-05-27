"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertClubAccess } from "@/lib/auth/scope";
import { cancelChargeForClub } from "@/lib/db/queries/charges";

const schema = z.object({
  clubSlug: z.string().min(1),
  chargeId: z.string().min(1),
  reason: z.string().max(200).optional()
});

export type CancelChargeResult = { ok: true } | { ok: false; error: string };

/**
 * Club-Admin or Trainer cancels a single confirmed/pending_approval charge.
 * Invoiced charges cannot be cancelled via this action.
 */
export async function cancelChargeAction(
  input: z.infer<typeof schema>
): Promise<CancelChargeResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };

  const { clubSlug, chargeId, reason } = parsed.data;
  const { club } = await assertClubAccess(clubSlug, "trainer");

  const cancelled = await cancelChargeForClub(
    chargeId,
    club.id,
    reason?.trim() || "Manuell storniert"
  );

  if (!cancelled) {
    return {
      ok: false,
      error:
        "Charge konnte nicht storniert werden — bereits abgerechnet, storniert oder nicht gefunden."
    };
  }

  revalidatePath(`/verein/${clubSlug}/charges`);
  return { ok: true };
}
