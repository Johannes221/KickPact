import { z } from "zod";

/**
 * @deprecated pledgeProxy / Eltern-Proxy-Feature ist deprecated (Migration 0027).
 * Code bleibt als Reference — wird nicht mehr in der App verwendet.
 *
 * export const pledgeProxySchema = z.object({ name, sharePercent, note? });
 * export const pledgeProxiesSchema = z.array(pledgeProxySchema).refine(...);
 * export type PledgeProxy = z.infer<typeof pledgeProxySchema>;
 */

const baseSchema = z.object({
  displayName: z.string().min(2, "Name fehlt")
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
