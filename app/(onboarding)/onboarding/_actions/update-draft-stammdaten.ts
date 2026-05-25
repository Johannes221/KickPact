"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships } from "@/lib/db/schema";
import { requireUserOrThrow } from "@/lib/auth/session";

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

  const [membership] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(eq(clubMemberships.clubId, parsed.clubId), eq(clubMemberships.userId, user.id))
    )
    .limit(1);
  if (!membership || membership.role !== "admin") {
    throw new Error("Du bist nicht berechtigt, diesen Draft zu bearbeiten.");
  }

  const [club] = await db
    .select({ onboardingStatus: clubs.onboardingStatus })
    .from(clubs)
    .where(eq(clubs.id, parsed.clubId))
    .limit(1);
  if (!club) throw new Error("Verein nicht gefunden.");
  if (club.onboardingStatus === "completed") {
    throw new Error(
      "Verein ist bereits vollständig onboarded — Stammdaten-Edit läuft hier nicht mehr über den Wizard."
    );
  }

  await db
    .update(clubs)
    .set({
      ort: parsed.city,
      isSmallBusiness: parsed.isSmallBusiness,
      taxId: parsed.taxId || null,
      iban: parsed.iban || null,
      addressJson: {
        street: parsed.street,
        zip: parsed.zip,
        city: parsed.city,
        country: "DE"
      },
      onboardingStatus: "stammdaten_complete",
      updatedAt: new Date()
    })
    .where(eq(clubs.id, parsed.clubId));

  return { ok: true };
}
