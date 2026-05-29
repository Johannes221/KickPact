import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getActiveDraftForUser } from "@/lib/db/queries/onboarding-draft";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { WizardShell } from "../../_components/wizard-shell";
import { StammdatenForm } from "../../_components/stammdaten-form";

export const metadata = { title: "Stammdaten · KickPact" };

export default async function MannschaftFlowStep2() {
  const user = await requireUser();
  const draft = await getActiveDraftForUser(user.id);
  if (!draft) redirect("/onboarding");
  if (draft.onboardingRole !== "mannschaft") redirect("/onboarding");

  const [club] = await db
    .select({
      addressJson: clubs.addressJson,
      isSmallBusiness: clubs.isSmallBusiness,
      taxId: clubs.taxId,
      iban: clubs.iban
    })
    .from(clubs)
    .where(eq(clubs.id, draft.clubId))
    .limit(1);

  return (
    <WizardShell step={2} role="mannschaft" backHref="/onboarding/mannschaft/verein?change=1">
      <StammdatenForm
        clubId={draft.clubId}
        role="mannschaft"
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
