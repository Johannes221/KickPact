import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getActiveDraftForUser, nextOnboardingStep } from "@/lib/db/queries/onboarding-draft";
import { WizardShell } from "../../_components/wizard-shell";
import { VereinSearchStep } from "../../_components/verein-search-step";

export const metadata = { title: "Verein wählen · KickPact" };

/**
 * Step 1 (Verein-Flow): Verein suchen + mehrere Mannschaften wählen → Draft
 * mit plan=verein anlegen.
 *
 * Resume-Logik: Wenn der User schon einen Draft hat, schicken wir ihn zur
 * passenden Step weiter — Step 1 nochmal zu zeigen würde den Eindruck erwecken,
 * der vorherige Versuch sei verloren.
 */
export default async function VereinFlowStep1() {
  const user = await requireUser();
  const draft = await getActiveDraftForUser(user.id);
  if (draft) redirect(nextOnboardingStep(draft));

  return (
    <WizardShell step={1} role="verein">
      <VereinSearchStep role="verein" />
    </WizardShell>
  );
}
