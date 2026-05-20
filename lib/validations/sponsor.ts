import { z } from "zod";

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
