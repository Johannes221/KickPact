import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getActiveDraftForUser, nextOnboardingStep } from "@/lib/db/queries/onboarding-draft";
import { WizardShell } from "../../_components/wizard-shell";
import { VereinSearchStep } from "../../_components/verein-search-step";

export const metadata = { title: "Verein wählen · KickPact" };

/**
 * Step 1 (Mannschaft-Flow): Verein suchen + EINE Mannschaft wählen → Draft
 * mit plan=pro Trial anlegen.
 */
export default async function MannschaftFlowStep1() {
  const user = await requireUser();
  const draft = await getActiveDraftForUser(user.id);
  if (draft) redirect(nextOnboardingStep(draft));

  return (
    <WizardShell step={1} role="mannschaft">
      <VereinSearchStep role="mannschaft" />
    </WizardShell>
  );
}
