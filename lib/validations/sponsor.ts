import { z } from "zod";

export const pledgeProxySchema = z.object({
  name: z.string().min(2, "Name fehlt").max(80, "Name zu lang"),
  sharePercent: z
    .number({ invalid_type_error: "Anteil als Zahl" })
    .min(0, "Anteil min 0%")
    .max(100, "Anteil max 100%"),
  note: z.string().max(200, "Notiz zu lang").optional()
});

export type PledgeProxy = z.infer<typeof pledgeProxySchema>;

/**
 * Array von Sub-Sponsoren ("Eltern-Proxy" für Junioren).
 * - Leeres Array ist zulässig (Default-Fall).
 * - Wenn nicht leer: Summe der `sharePercent` MUSS exakt 100 sein.
 *   Toleranz beachten wir wegen Float-Eingaben mit < 0.01 nicht — UI sollte
 *   ganzzahlige Prozente erzwingen.
 */
export const pledgeProxiesSchema = z
  .array(pledgeProxySchema)
  .max(20, "Maximal 20 Sub-Sponsoren")
  .refine(
    (arr) =>
      arr.length === 0 ||
      arr.reduce((s, p) => s + p.sharePercent, 0) === 100,
    "Summe der Anteile muss 100% sein"
  );

const baseSchema = z.object({
  displayName: z.string().min(2, "Name fehlt"),
  pledgeProxies: pledgeProxiesSchema.optional()
});

export const sponsorFamilieSchema = baseSchema.extend({
  type: z.literal("familie")
});

export const sponsorBusinessSchema = baseSchema.extend({
  type: z.literal("business"),
  businessName: z.string().min(2, "Firma fehlt"),
  street: z.string().min(2),
  zip: z.string().min(4),
  city: z.string().min(2),
  businessTaxId: z.string().optional()
});

export const sponsorOnboardingSchema = z.discriminatedUnion("type", [
  sponsorFamilieSchema,
  sponsorBusinessSchema
]);

export type SponsorOnboardingInput = z.infer<typeof sponsorOnboardingSchema>;
