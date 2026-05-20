import { Suspense } from "react";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { StammdatenStep } from "../_components/stammdaten-step";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/4" }
];

export default function Step3Page() {
  return (
    <div className="space-y-6 md:space-y-10">
      <WizardProgress steps={STEPS} currentStep={3} />
      <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
        <StammdatenStep />
      </Suspense>
    </div>
  );
}
