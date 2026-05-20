import { WizardProgress } from "@/components/shared/wizard-progress";
import { SearchStep } from "../_components/search-step";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/4" }
];

export default function Step1Page() {
  return (
    <div className="space-y-10">
      <WizardProgress steps={STEPS} currentStep={1} />
      <SearchStep />
    </div>
  );
}
