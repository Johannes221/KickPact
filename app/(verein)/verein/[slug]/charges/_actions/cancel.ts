"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertClubAccess } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import {
  cancelChargeForClub,
  getChargeSponsorContactForClub
} from "@/lib/db/queries/charges";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { triggerLabel } from "@/lib/triggers/labels";

const schema = z.object({
  clubSlug: z.string().min(1),
  chargeId: z.string().min(1),
  reason: z.string().max(200).optional()
});

export type CancelChargeResult = { ok: true } | { ok: false; error: string };

/**
 * Club-Admin or Trainer cancels a single confirmed/pending_approval charge.
 * Invoiced charges cannot be cancelled via this action.
 *
 * SECURITY (H5): Der stornierende Nutzer wird im Audit-Trail festgehalten
 * (charges.cancelled_by_user_id) und der betroffene Sponsor per Mail informiert
 * (best-effort), damit ein Verein eine legitime Charge nicht still unterdrücken
 * kann.
 */
export async function cancelChargeAction(
  input: z.infer<typeof schema>
): Promise<CancelChargeResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };

  const { clubSlug, chargeId, reason } = parsed.data;
  const { club } = await assertClubAccess(clubSlug, "trainer");
  const user = await requireUser();

  // Sponsor-Kontakt VOR dem Storno laden (für die Benachrichtigung).
  const contact = await getChargeSponsorContactForClub(chargeId, club.id);

  const cleanReason = reason?.trim() || "Manuell storniert";
  const cancelled = await cancelChargeForClub(chargeId, club.id, cleanReason, user.id);

  if (!cancelled) {
    return {
      ok: false,
      error:
        "Beitrag konnte nicht storniert werden — bereits abgerechnet, storniert oder nicht gefunden."
    };
  }

  // Sponsor informieren (best-effort — Storno ist bereits passiert).
  if (contact?.sponsorEmail) {
    try {
      const euro = (contact.amountCents / 100).toFixed(2).replace(".", ",");
      await resend.emails.send({
        from: MAIL_FROM,
        to: contact.sponsorEmail,
        subject: "KickPact: Ein Beitrag wurde storniert",
        text:
          `Hi,\n\n` +
          `der Verein hat einen deiner Beiträge (${euro} €, „${triggerLabel(contact.triggerType)}") storniert.\n` +
          `Grund: ${cleanReason}\n\n` +
          `Er erscheint damit nicht auf der nächsten Monatsrechnung. Falls das ` +
          `unerwartet ist, wende dich bitte direkt an den Verein.\n\n` +
          `KickPact`,
        headers: {
          "Idempotency-Key": `charge-cancelled-${chargeId}`
        }
      });
    } catch (err) {
      console.error("[charges] sponsor cancel-notification failed", err);
    }
  }

  revalidatePath(`/verein/${clubSlug}/charges`);
  return { ok: true };
}
