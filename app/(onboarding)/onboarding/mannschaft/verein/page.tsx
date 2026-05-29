import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getActiveDraftForUser, nextOnboardingStep } from "@/lib/db/queries/onboarding-draft";
import { WizardShell } from "../../_components/wizard-shell";
import { VereinSearchStep } from "../../_components/verein-search-step";
import { DraftChangeGate } from "../../_components/draft-change-gate";

export const metadata = { title: "Verein wählen · KickPact" };

/**
 * Step 1 (Mannschaft-Flow): Verein suchen + EINE Mannschaft wählen → Draft
 * mit plan=pro Trial anlegen.
 *
 * Beim normalen Aufruf mit existierendem Draft → vorwärts zum nächsten Step.
 * Per „← Zurück" (`?change=1`) → DraftChangeGate (Wahl behalten oder verwerfen).
 */
export default async function MannschaftFlowStep1({
  searchParams
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  const user = await requireUser();
  const { change } = await searchParams;
  const draft = await getActiveDraftForUser(user.id);
  if (draft && !change) redirect(nextOnboardingStep(draft));

  return (
    <WizardShell step={1} role="mannschaft">
      {draft ? (
        <DraftChangeGate
          role="mannschaft"
          clubId={draft.clubId}
          vereinName={draft.vereinName}
          teamCount={draft.teamCount}
        />
      ) : (
        <VereinSearchStep role="mannschaft" />
      )}
    </WizardShell>
  );
}
