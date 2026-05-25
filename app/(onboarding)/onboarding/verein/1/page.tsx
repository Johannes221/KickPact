import { WizardProgress } from "@/components/shared/wizard-progress";
import { SearchStep } from "../_components/search-step";
import { SignupCompletedTracker } from "@/components/analytics/signup-completed-tracker";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Verifikation", href: "/onboarding/verein/4" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/5" }
];

export default async function Step1Page({
  searchParams
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const signupRole =
    role === "mannschaft" || role === "verein" ? role : null;
  return (
    <div className="space-y-6 md:space-y-10">
      {/* Feuert signup_completed einmal pro Session — Step 1 ist der erste
          authentifizierte Touchpoint nach Magic-Link- oder OAuth-Callback. */}
      <SignupCompletedTracker />
      <WizardProgress steps={STEPS} currentStep={1} />
      <SearchStep signupRole={signupRole} />
    </div>
  );
}
