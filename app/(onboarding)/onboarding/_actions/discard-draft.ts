"use server";

import { requireUserOrThrow } from "@/lib/auth/session";
import { discardDraftClubIfOwner } from "@/lib/db/queries/onboarding-draft";

/**
 * Verwirft einen Onboarding-Draft-Club des aktuellen Users — z.B. wenn er im
 * Wizard „zurück" geht und einen anderen Verein wählen will.
 *
 * Sicherheits-Guards:
 *   - Nur der admin-Owner darf verwerfen.
 *   - Nur Clubs mit onboardingStatus != 'completed' (ein fertig onboardeter
 *     Verein wird NIE über diesen Pfad gelöscht).
 *
 * Der Delete cascadet über die FK-Constraints auf teams, subscriptions,
 * team_licenses, club_memberships und invitations (alle onDelete: cascade).
 *
 * Idempotent: existiert der Club nicht (mehr) oder ist er nicht löschbar,
 * passiert nichts (kein Fehler) — der Aufrufer landet danach ohnehin im
 * frischen Verein-Step.
 */
export async function discardDraftClub(clubId: string): Promise<{ ok: true }> {
  const user = await requireUserOrThrow();
  await discardDraftClubIfOwner({ userId: user.id, clubId });
  return { ok: true };
}
