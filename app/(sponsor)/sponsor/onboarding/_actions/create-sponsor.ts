"use server";

import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { sponsorOnboardingSchema, type SponsorOnboardingInput } from "@/lib/validations/sponsor";
import { markInvitationUsed } from "@/lib/db/queries/invitations";

export async function createSponsor(input: SponsorOnboardingInput, invitationToken?: string) {
  const user = await requireUser();
  const parsed = sponsorOnboardingSchema.parse(input);

  const [sponsor] = await db
    .insert(sponsors)
    .values({
      userId: user.id,
      displayName: parsed.displayName,
      type: parsed.type,
      businessName: parsed.type === "business" ? parsed.businessName : null,
      businessAddressJson:
        parsed.type === "business"
          ? {
              street: parsed.street,
              zip: parsed.zip,
              city: parsed.city,
              country: "DE"
            }
          : null,
      businessTaxId: parsed.type === "business" ? parsed.businessTaxId || null : null
    })
    .returning();

  if (invitationToken) {
    await markInvitationUsed(invitationToken, user.id);
  }

  return { sponsorId: sponsor.id };
}
