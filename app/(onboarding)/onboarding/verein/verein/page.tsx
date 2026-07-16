import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getActiveDraftForUser, nextOnboardingStep } from "@/lib/db/queries/onboarding-draft";
import { WizardShell } from "../../_components/wizard-shell";
import { VereinSearchStep } from "../../_components/verein-search-step";
import { DraftChangeGate } from "../../_components/draft-change-gate";
import { redirectIfAlreadyOnboarded } from "../../_lib/entry-guard";

export const metadata = { title: "Verein wählen · KickPact" };

/**
 * Step 1 (Verein-Flow): Verein suchen + mehrere Mannschaften wählen → Draft
 * mit plan=verein anlegen.
 *
 * Resume-Logik: Wenn der User schon einen Draft hat, schicken wir ihn beim
 * normalen Aufruf zur passenden Step weiter. Kommt er aber per „← Zurück"
 * (`?change=1`) hierher, zeigen wir das DraftChangeGate — er kann seine Wahl
 * behalten oder den Draft verwerfen und einen anderen Verein wählen.
 * Wer hier OHNE Draft, aber MIT bestehender Identität landet (Marketing-Link
 * umgeht den /dashboard-Dispatcher), wird ins Dashboard geleitet.
 */
export default async function VereinFlowStep1({
  searchParams
}: {
  searchParams: Promise<{ change?: string; add?: string }>;
}) {
  const user = await requireUser();
  const { change, add } = await searchParams;
  const draft = await getActiveDraftForUser(user.id);
  if (draft && !change) redirect(nextOnboardingStep(draft));
  // `add=1` = bewusstes „Neue Rolle hinzufügen" (Chooser auf /signup?add=1).
  // Der Guard darf dann NICHT greifen — sonst schickt er User mit bestehender
  // Identity zurück zu /select-role und der Add-Flow wird ein Endlos-Kreislauf.
  if (!draft && add !== "1") await redirectIfAlreadyOnboarded(user.id);

  return (
    <WizardShell
      step={1}
      role="verein"
      userContext={user.name || user.email}
      cancelClubId={draft?.clubId}
    >
      {draft ? (
        <DraftChangeGate
          role="verein"
          clubId={draft.clubId}
          vereinName={draft.vereinName}
          teamCount={draft.teamCount}
        />
      ) : (
        <VereinSearchStep role="verein" />
      )}
    </WizardShell>
  );
}
