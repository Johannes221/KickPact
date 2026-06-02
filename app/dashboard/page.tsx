import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/admin";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import {
  getStoredPrimaryRole,
  persistPrimaryRoleIfUnset,
  primaryDestinationFor
} from "@/lib/auth/primary-role";
import { getActiveDraftForUser } from "@/lib/db/queries/onboarding-draft";

/**
 * Smart post-login dispatcher. Loads the user's identity snapshot once and
 * redirects to the right destination:
 *   - aktiver Onboarding-Draft → /onboarding (Resume-Dispatcher springt zur
 *     letzten unvollständigen Step). Wichtig: muss VOR der Identity-Check
 *     gepürft werden, damit ein halbfertiger Wizard nicht ignoriert wird.
 *   - 0 identities → /signup (3-card role chooser)
 *   - sonst → Dashboard der HAUPTROLLE (users.primary_role). Bei mehreren
 *     Rollen wird NICHT mehr /select-role gezeigt — der User landet direkt in
 *     seiner Hauptrolle und wechselt bei Bedarf über das Header-Menü. Ist noch
 *     keine Hauptrolle gesetzt, wird die erste Identität als Default genommen
 *     und lazy persistiert (damit „Mein Konto" + Logo-Link konsistent sind).
 *
 * Auflösungs-Logik in primaryDestinationFor (pure, lib/auth/primary-role.ts).
 */
export default async function DashboardRedirect() {
  const user = await requireUser();

  // Plattform-Operatoren gehören NICHT in die Nutzer-App (keine Doppelrolle) →
  // direkt ins Backoffice.
  if (await isPlatformAdminEmail(user.email)) redirect("/admin");

  const draft = await getActiveDraftForUser(user.id);
  if (draft) redirect("/onboarding");

  const identities = await getUserIdentities(user.id);
  const stored = await getStoredPrimaryRole(user.id);
  const dest = primaryDestinationFor(identities, stored);

  // Default lazy festschreiben (= zuerst verfügbare Rolle), wenn der User noch
  // keine Hauptrolle gewählt hat. isNull-Guard in der Query macht es race-sicher.
  if (dest.defaulted && dest.resolvedId && !stored) {
    await persistPrimaryRoleIfUnset(user.id, dest.resolvedId);
  }

  redirect(dest.href);
}
