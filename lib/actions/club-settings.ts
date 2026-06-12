"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import {
  normalizePaypalHandle,
  validateStripePaymentLink
} from "@/lib/invoicing/payment-options";

const updateClubSchema = z.object({
  name: z.string().min(2, "Vereinsname fehlt"),
  ort: z.string().optional().or(z.literal("")),
  street: z.string().min(2, "Straße fehlt"),
  zip: z.string().min(4, "PLZ fehlt"),
  city: z.string().min(2, "Stadt fehlt"),
  isSmallBusiness: z.boolean(),
  taxId: z.string().optional().or(z.literal("")),
  iban: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v.length >= 15, "IBAN zu kurz")
    .refine((v) => !v || v.length <= 34, "IBAN zu lang"),
  // Spec §1.9 (Phase 5): Zusatz-Zahlwege. Normalisierung/Validierung passiert
  // in lib/invoicing/payment-options (PayPal-Handle-Regex, Stripe-Prefix) —
  // hier nur grobe String-Constraints fürs Form-Schema.
  paypalHandle: z.string().max(120).optional().or(z.literal("")),
  stripePaymentLink: z.string().max(500).optional().or(z.literal(""))
});

export type UpdateClubInput = z.infer<typeof updateClubSchema>;

export async function updateClubSettings(
  slug: string,
  input: UpdateClubInput
): Promise<{ error?: string }> {
  try {
    const parsed = updateClubSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    const { club } = await assertClubAccess(slug, "admin");

    // Pay-Links normalisieren: PayPal speichert NUR den Handle („paypal.me/foo",
    // „@foo", volle URL → „foo"), Stripe-Link muss mit https://buy.stripe.com/
    // beginnen. Leere Eingabe = Zahlweg entfernen.
    const paypal = normalizePaypalHandle(parsed.data.paypalHandle ?? "");
    if (!paypal.ok) return { error: paypal.message };
    const stripeLink = validateStripePaymentLink(parsed.data.stripePaymentLink ?? "");
    if (!stripeLink.ok) return { error: stripeLink.message };

    await db
      .update(clubs)
      .set({
        name: parsed.data.name,
        ort: parsed.data.ort || null,
        taxId: parsed.data.taxId || null,
        isSmallBusiness: parsed.data.isSmallBusiness,
        addressJson: {
          street: parsed.data.street,
          zip: parsed.data.zip,
          city: parsed.data.city,
          country: "DE"
        },
        iban: parsed.data.iban || null,
        paypalHandle: paypal.handle,
        stripePaymentLink: stripeLink.url,
        updatedAt: new Date()
      })
      .where(eq(clubs.id, club.id));

    revalidatePath(`/verein/${slug}/einstellungen`);
    revalidatePath(`/verein/${slug}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler beim Speichern" };
  }
}
