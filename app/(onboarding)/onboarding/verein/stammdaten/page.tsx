import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  getActiveDraftForUser,
  getClubStammdaten
} from "@/lib/db/queries/onboarding-draft";
import { WizardShell } from "../../_components/wizard-shell";
import { StammdatenForm } from "../../_components/stammdaten-form";

export const metadata = { title: "Stammdaten · KickPact" };

export default async function VereinFlowStep2() {
  const user = await requireUser();
  const draft = await getActiveDraftForUser(user.id);
  if (!draft) redirect("/onboarding");
  if (draft.onboardingRole !== "verein") redirect("/onboarding");

  // Pre-fill: wenn User schon Stammdaten eingetragen hat (re-edit), aus DB laden.
  const club = await getClubStammdaten(draft.clubId);

  return (
    <WizardShell step={2} role="verein" backHref="/onboarding/verein/verein?change=1">
      <StammdatenForm
        clubId={draft.clubId}
        role="verein"
        defaultValues={{
          street: club?.addressJson?.street ?? "",
          zip: club?.addressJson?.zip ?? "",
          city: club?.addressJson?.city ?? "",
          isSmallBusiness: club?.isSmallBusiness ?? true,
          taxId: club?.taxId ?? "",
          iban: club?.iban ?? ""
        }}
      />
    </WizardShell>
  );
}
