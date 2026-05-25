import { Suspense } from "react";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { VerificationForm } from "./_components/verification-form";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Verifikation", href: "/onboarding/verein/4" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/5" }
];

export const metadata = { title: "Verifikation · KickPact" };

export default function Step4Page() {
  return (
    <div className="space-y-6 md:space-y-10">
      <WizardProgress steps={STEPS} currentStep={4} />
      <div>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Vertretungs-Nachweis hochladen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Damit niemand deinen Verein in deinem Namen anlegt, brauchen wir einen
          kurzen Nachweis, dass du ihn vertreten darfst.
        </p>
      </div>
      <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
        <VerificationForm />
      </Suspense>
    </div>
  );
}
