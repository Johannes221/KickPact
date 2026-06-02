"use server";

import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth/session";
import { saveDraftStammdaten } from "@/lib/db/queries/onboarding-draft";

const updateStammdatenSchema = z.object({
  clubId: z.string().min(1),
  street: z.string().min(1, "Straße fehlt"),
  zip: z.string().min(4).max(10),
  city: z.string().min(1, "Stadt fehlt"),
  isSmallBusiness: z.boolean(),
  taxId: z.string().optional(),
  iban: z.string().optional()
});

export type UpdateStammdatenInput = z.infer<typeof updateStammdatenSchema>;

/**
 * Step 2 des Onboarding-Wizards: persistiert die Vereins-Stammdaten und bumpt
 * onboardingStatus auf 'stammdaten_complete'.
 *
 * Erlaubt nur für eigene Drafts (clubMemberships.role = 'admin') und nur wenn
 * der Status noch 'draft' oder 'stammdaten_complete' ist (re-edit erlaubt).
 * Completed-Clubs werfen, weil Stammdaten-Edit dort über die normalen
 * Vereins-Einstellungen läuft, nicht den Wizard.
 */
export async function updateDraftStammdaten(input: UpdateStammdatenInput): Promise<{ ok: true }> {
  const user = await requireUserOrThrow();
  const parsed = updateStammdatenSchema.parse(input);

  const result = await saveDraftStammdaten({ userId: user.id, ...parsed });
  switch (result) {
    case "forbidden":
      throw new Error("Du bist nicht berechtigt, diesen Draft zu bearbeiten.");
    case "not_found":
      throw new Error("Verein nicht gefunden.");
    case "already_completed":
      throw new Error(
        "Verein ist bereits vollständig onboarded — Stammdaten-Edit läuft hier nicht mehr über den Wizard."
      );
    case "ok":
      return { ok: true };
  }
}
