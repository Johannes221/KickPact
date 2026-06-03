import { redirect } from "next/navigation";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";

/**
 * Gemeinsamer Einstiegs-Guard für die Wizard-Step-1-Seiten.
 *
 * Hintergrund: Die Marketing-/Preis-Seiten verlinken DIREKT auf
 * `/onboarding/{role}/verein` (siehe app/(marketing)/preise) und umgehen damit
 * den `/dashboard`-Dispatcher. Ein bereits onboardeter User (≥1 Identity, aber
 * KEIN offener Draft) landete dadurch erneut im Anlege-Flow statt in seinem
 * Dashboard. Dieser Guard prüft die Identitäten und leitet ihn an das passende
 * Ziel weiter (Verein-/Mannschafts-Dashboard bzw. /select-role bei mehreren).
 *
 * Wird NUR aufgerufen, wenn KEIN aktiver Draft existiert (ein offener Draft hat
 * Vorrang — der gehört in den Resume-Pfad, nicht ins Dashboard).
 *
 * `redirect()` wirft intern (NEXT_REDIRECT) — der Aufrufer kehrt nicht zurück,
 * wenn umgeleitet wird.
 */
export async function redirectIfAlreadyOnboarded(userId: string): Promise<void> {
  const identities = await getUserIdentities(userId);
  const total =
    identities.clubs.length +
    identities.teamOnly.length +
    (identities.sponsor ? 1 : 0);
  if (total > 0) {
    redirect(pickDashboardDestination(identities));
  }
}
