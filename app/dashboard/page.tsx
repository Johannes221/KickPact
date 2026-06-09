import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isPlatformAdminUser } from "@/lib/auth/admin";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import {
  getStoredPrimaryRole,
  persistPrimaryRoleIfUnset,
  primaryDestinationFor
} from "@/lib/auth/primary-role";
import { getActiveDraftForUser } from "@/lib/db/queries/onboarding-draft";

/**
 * Onboarding-Wizard pro Rolle. Wird NUR für brandneue User (0 Identities, kein
 * Draft) genutzt, die über einen Signup-OAuth-/Magic-Link-Callback mit
 * `?role=X` hier landen. Returning-User (≥1 Identity) ignorieren den Param und
 * gehen ins Rollen-Dashboard.
 */
const SIGNUP_ROLE_DESTINATION: Record<string, string> = {
  mannschaft: "/onboarding/mannschaft/verein",
  verein: "/onboarding/verein/verein",
  sponsor: "/sponsor/onboarding"
};

/**
 * Smart post-login dispatcher. Loads the user's identity snapshot once and
 * redirects to the right destination:
 *   - aktiver Onboarding-Draft → /onboarding (Resume-Dispatcher springt zur
 *     letzten unvollständigen Step). Wichtig: muss VOR der Identity-Check
 *     gepürft werden, damit ein halbfertiger Wizard nicht ignoriert wird.
 *   - 0 identities → role-spezifischer Onboarding-Wizard (wenn `?role=X` vom
 *     Signup-Callback mitkommt), sonst /signup (3-card role chooser).
 *   - sonst → Dashboard der HAUPTROLLE (users.primary_role). Bei mehreren
 *     Rollen wird NICHT mehr /select-role gezeigt — der User landet direkt in
 *     seiner Hauptrolle und wechselt bei Bedarf über das Header-Menü. Ist noch
 *     keine Hauptrolle gesetzt, wird die erste Identität als Default genommen
 *     und lazy persistiert (damit „Mein Konto" + Logo-Link konsistent sind).
 *
 * Wichtig: ALLE Auth-Callbacks (Login UND Signup) laufen durch diesen
 * Dispatcher. Der Signup-Flow gibt nur einen `?role`-Hint mit, der ausschließlich
 * für 0-Identity-User greift — so kann ein returning Apple-/Google-User, der
 * versehentlich über den Signup-Screen reinkommt, NICHT mehr im Anlegen-Wizard
 * stranden, sondern landet in seinem bestehenden Rollen-Dashboard.
 *
 * Auflösungs-Logik in primaryDestinationFor (pure, lib/auth/primary-role.ts).
 */
export default async function DashboardRedirect({
  searchParams
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await requireUser();
  const { role } = await searchParams;

  // Plattform-Operatoren gehören NICHT in die Nutzer-App (keine Doppelrolle) →
  // direkt ins Backoffice.
  if (await isPlatformAdminUser(user.id)) redirect("/admin");

  const draft = await getActiveDraftForUser(user.id);
  if (draft) redirect("/onboarding");

  const identities = await getUserIdentities(user.id);
  const stored = await getStoredPrimaryRole(user.id);
  const dest = primaryDestinationFor(identities, stored);

  // Brandneuer User (0 Identities) MIT Signup-Rollen-Hint → direkt in den
  // passenden Onboarding-Wizard, statt über den 3-Wege-Chooser (/signup) zu
  // gehen. Nur wenn der Dispatcher selbst auf /signup zeigen würde (= wirklich
  // keine Identity) — bei ≥1 Identity ignorieren wir den Hint komplett.
  if (dest.href === "/signup" && role && SIGNUP_ROLE_DESTINATION[role]) {
    redirect(SIGNUP_ROLE_DESTINATION[role]);
  }

  // Default lazy festschreiben (= zuerst verfügbare Rolle), wenn der User noch
  // keine Hauptrolle gewählt hat. isNull-Guard in der Query macht es race-sicher.
  if (dest.defaulted && dest.resolvedId && !stored) {
    await persistPrimaryRoleIfUnset(user.id, dest.resolvedId);
  }

  redirect(dest.href);
}
