import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Onboarding · KickPact" };

/**
 * Top-Level-Layout für das gesamte Onboarding-Routesegment. Hängt die Auth-Wand
 * davor — jede onboarding-Page (Resume-Dispatcher und Wizard-Steps) hat dadurch
 * garantiert einen eingeloggten User. Die Pages selbst rendern ihre eigene
 * `<WizardShell>` mit Step + Role.
 */
export default async function OnboardingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
