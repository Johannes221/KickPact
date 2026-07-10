"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireUserOrThrow } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

/**
 * Privatpersonen-only (Spec 2026-07-06): Das frühere updateBusinessSchema
 * (Firmenname, Rechnungsadresse, USt-ID) ist ersatzlos entfallen — Sponsoren
 * sind ausschließlich Privatpersonen. Die inerten Business-Spalten werden bei
 * jedem Update defensiv genullt.
 */
const updateSponsorSchema = z.object({
  type: z.literal("familie"),
  displayName: z.string().min(2, "Name fehlt"),
  role: z.string().max(40).optional().or(z.literal("")),
  description: z.string().max(200, "Max. 200 Zeichen").optional().or(z.literal(""))
});

export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;

export async function updateSponsorProfile(
  input: UpdateSponsorInput
): Promise<{ error?: string }> {
  try {
    const user = await requireUserOrThrow();
    const parsed = updateSponsorSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    const [sponsor] = await db
      .select()
      .from(sponsors)
      .where(eq(sponsors.userId, user.id))
      .limit(1);
    if (!sponsor) return { error: "Kein Sponsor-Profil gefunden." };

    await db
      .update(sponsors)
      .set({
        displayName: parsed.data.displayName,
        role: parsed.data.role || null,
        description: parsed.data.description || null,
        // Inerte Business-Felder defensiv nullen (Privatpersonen-only).
        businessName: null,
        businessAddressJson: null,
        businessTaxId: null
      })
      // Auf die konkrete gefundene Profil-Zeile scopen — ein User kann mehrere
      // Sponsor-Profile haben (DSGVO-Export ist multi-profile-aware); ein
      // userId-weiter Update hätte ALLE auf denselben Namen überschrieben.
      .where(eq(sponsors.id, sponsor.id));

    revalidatePath("/sponsor/profil");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}
