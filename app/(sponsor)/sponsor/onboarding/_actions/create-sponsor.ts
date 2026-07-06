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

  // Privatpersonen-only (Spec 2026-07-06): type ist immer "familie", die
  // inerten Business-Spalten werden nie mehr befüllt.
  const sponsor = await createSponsorProfile({
    userId: user.id,
    displayName: parsed.displayName,
    type: "familie",
    role: parsed.role || null,
    description: parsed.description || null,
    businessName: null,
    businessAddressJson: null,
    businessTaxId: null
  });

  if (invitationToken) {
    await markInvitationUsed(invitationToken, user.id);
  }

  return { sponsorId: sponsor.id };
}
