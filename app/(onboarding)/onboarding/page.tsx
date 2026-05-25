import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";
import {
  getActiveDraftForUser,
  nextOnboardingStep
} from "@/lib/db/queries/onboarding-draft";

/**
 * Resume-Dispatcher für den Onboarding-Wizard.
 *
 * Reihenfolge:
 *  1. Hat User einen aktiven Draft? → Springe zur letzten unvollständigen Step.
 *  2. Hat User eine completed Identity? → Dashboard / Verein-Page (kein Sinn,
 *     Onboarding erneut zu starten — `/signup` zeigt den 3-Wege-Chooser für
 *     Zusatz-Rollen).
 *  3. Sonst → `/signup` (Rollen-Auswahl).
 *
 * Diese Page existiert speziell für die Bug-Klasse: User-Wizard crasht in
 * Step N, User klickt später erneut auf "Account anlegen" oder kommt von
 * Magic-Link zurück — vorher landete er im "Wie willst du starten?"-Chooser
 * obwohl er schon einen halbfertigen Draft hatte und seine Mannschaft "verloren"
 * schien. Jetzt: konsistenter Resume.
 */
export default async function OnboardingResumePage() {
  const user = await requireUser();

  const draft = await getActiveDraftForUser(user.id);
  if (draft) {
    redirect(nextOnboardingStep(draft));
  }

  const identities = await getUserIdentities(user.id);
  const total =
    identities.clubs.length + identities.teamOnly.length + (identities.sponsor ? 1 : 0);
  if (total > 0) {
    redirect(pickDashboardDestination(identities));
  }

  redirect("/signup");
}
