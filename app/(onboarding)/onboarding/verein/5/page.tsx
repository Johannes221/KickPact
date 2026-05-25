import { Suspense } from "react";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { InviteStep } from "../_components/invite-step";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Verifikation", href: "/onboarding/verein/4" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/5" }
];

export default function Step5Page() {
  return (
    <div className="space-y-6 md:space-y-10">
      <WizardProgress steps={STEPS} currentStep={5} />
      <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
        <InviteStep />
      </Suspense>
    </div>
  );
}
