import { z } from "zod";

export const clubStammdatenSchema = z.object({
  contactName: z.string().min(2, "Name fehlt"),
  street: z.string().min(2, "Straße fehlt"),
  zip: z.string().min(4, "PLZ zu kurz"),
  city: z.string().min(2, "Stadt fehlt"),
  // Default: Kleinunternehmer (§19). Kann später im Dashboard angepasst werden.
  isSmallBusiness: z.boolean().default(true),
  taxId: z.string().optional().or(z.literal("")),
  // IBAN ist OPTIONAL beim Onboarding — kann später im Dashboard ergänzt
  // werden. Erst nötig wenn der Verein Rechnungen verschickt.
  iban: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v.length >= 15, "IBAN sieht zu kurz aus")
    .refine((v) => !v || v.length <= 34, "IBAN zu lang")
});

export type ClubStammdaten = z.infer<typeof clubStammdatenSchema>;
