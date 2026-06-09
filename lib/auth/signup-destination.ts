import type { UserIdentities } from "@/lib/db/queries/user-identities";

/**
 * Die Rollen, die ein eingeloggter User via `/signup?role=X` hinzufügen kann.
 *  - `mannschaft` mündet in `/onboarding/mannschaft/verein` (Pro-Trial).
 *  - `verein` mündet in `/onboarding/verein/verein` (Vereinslizenz-Trial).
 *  - `sponsor` mündet in `/sponsor/onboarding`.
 */
export type AddRoleTarget = "mannschaft" | "verein" | "sponsor";

/**
 * Entscheidet, wohin ein bereits eingeloggter User redirected werden soll,
 * wenn er `/signup` oder `/signup?role=X` öffnet:
 *
 *  - **Kein Role-Param + 0 Identities** → `/signup` (caller darf Add-Role-Auswahl
 *    rendern; *kein* Re-Signup-Screen).
 *  - **Kein Role-Param + ≥1 Identity** → identisch zu `pickDashboardDestination`.
 *  - **Role-Param + Rolle vorhanden** → Deep-Link in die Rolle.
 *  - **Role-Param + Rolle fehlt** → Onboarding-Wizard für die Rolle
 *    (`/onboarding/verein/1` bzw. `/sponsor/onboarding`).
 *
 * Pure Funktion ohne DB-Zugriff — kann frei in Server-Components und Tests
 * benutzt werden. Spiegelt bewusst die Logik von `pickDashboardDestination`,
 * damit beide Helper austauschbar bleiben (z.B. wenn der `total === 0`-Fall
 * irgendwann anders gerouted werden soll).
 */
export function pickAuthenticatedSignupDestination(
  ids: UserIdentities,
  role: AddRoleTarget | null
): string {
  const total =
    ids.clubs.length + ids.teamOnly.length + (ids.sponsor ? 1 : 0);

  // ── Ohne explizite Rolle: Rollen-Hub zeigen ───────────────────────────────
  // 0 Rollen → /signup (caller rendert den 3-Wege-Chooser „wähle wie du
  // startest"). Ab 1 Rolle → /select-role: der eingeloggte User soll seine
  // vorhandene(n) Rolle(n) sehen und auswählen + „Neue Rolle hinzufügen",
  // statt bei genau einer Rolle stumm deep-gelinkt zu werden. (Der
  // Post-Login-Direktsprung in die Hauptrolle läuft separat über /dashboard.)
  if (!role) {
    return total === 0 ? "/signup" : "/select-role";
  }

  // ── Sponsor-Add-Role ──────────────────────────────────────────────────────
  if (role === "sponsor") {
    return ids.sponsor ? "/sponsor" : "/sponsor/onboarding";
  }

  // ── Mannschaft / Verein-Add-Role ──────────────────────────────────────────
  // Bereits eine Club- oder Team-Membership? → Deep-Link.
  if (ids.clubs[0]) return `/verein/${ids.clubs[0].slug}`;
  if (ids.teamOnly[0]) {
    return `/verein/${ids.teamOnly[0].clubSlug}/mannschaft/${ids.teamOnly[0].teamId}`;
  }
  // Sonst → rollenspezifischen Wizard starten.
  return role === "verein"
    ? "/onboarding/verein/verein"
    : "/onboarding/mannschaft/verein";
}
