import { z } from "zod";

export const clubStammdatenSchema = z.object({
  contactName: z.string().min(2, "Name fehlt"),
  street: z.string().min(2, "Straße fehlt"),
  zip: z.string().min(4, "PLZ zu kurz"),
  city: z.string().min(2, "Stadt fehlt"),
  isSmallBusiness: z.boolean(),
  taxId: z.string().optional(),
  iban: z.string().min(15, "IBAN sieht zu kurz aus").max(34)
});

export type ClubStammdaten = z.infer<typeof clubStammdatenSchema>;
