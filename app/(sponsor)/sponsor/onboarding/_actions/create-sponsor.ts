"use server";

import { requireUser } from "@/lib/auth/session";
import { assertNotPlatformAdminAction } from "@/lib/auth/admin";
import { sponsorOnboardingSchema, type SponsorOnboardingInput } from "@/lib/validations/sponsor";
import { markInvitationUsed } from "@/lib/db/queries/invitations";
import { createSponsorProfile } from "@/lib/db/queries/sponsor-dashboard";

export async function createSponsor(input: SponsorOnboardingInput, invitationToken?: string) {
  const user = await requireUser();
  await assertNotPlatformAdminAction(user.email);
  const parsed = sponsorOnboardingSchema.parse(input);

  const sponsor = await createSponsorProfile({
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
  });

  if (invitationToken) {
    await markInvitationUsed(invitationToken, user.id);
  }

  return { sponsorId: sponsor.id };
}
