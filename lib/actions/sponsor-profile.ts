"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

const updateFamilieSchema = z.object({
  type: z.literal("familie"),
  displayName: z.string().min(2, "Name fehlt")
});

const updateBusinessSchema = z.object({
  type: z.literal("business"),
  displayName: z.string().min(2, "Name fehlt"),
  businessName: z.string().min(2, "Firmenname fehlt"),
  street: z.string().min(2, "Straße fehlt"),
  zip: z.string().min(4, "PLZ fehlt"),
  city: z.string().min(2, "Stadt fehlt"),
  businessTaxId: z.string().optional().or(z.literal(""))
});

const updateSponsorSchema = z.discriminatedUnion("type", [
  updateFamilieSchema,
  updateBusinessSchema
]);

export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;

export async function updateSponsorProfile(
  input: UpdateSponsorInput
): Promise<{ error?: string }> {
  try {
    const user = await requireUser();
    const parsed = updateSponsorSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    const [sponsor] = await db
      .select()
      .from(sponsors)
      .where(eq(sponsors.userId, user.id))
      .limit(1);
    if (!sponsor) return { error: "Kein Sponsor-Profil gefunden." };

    if (parsed.data.type === "familie") {
      await db
        .update(sponsors)
        .set({ displayName: parsed.data.displayName })
        .where(eq(sponsors.userId, user.id));
    } else {
      await db
        .update(sponsors)
        .set({
          displayName: parsed.data.displayName,
          businessName: parsed.data.businessName,
          businessAddressJson: {
            street: parsed.data.street,
            zip: parsed.data.zip,
            city: parsed.data.city,
            country: "DE"
          },
          businessTaxId: parsed.data.businessTaxId || null
        })
        .where(eq(sponsors.userId, user.id));
    }

    revalidatePath("/sponsor/profil");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}
