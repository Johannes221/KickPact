import { Suspense } from "react";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { TeamPlanStep } from "../_components/team-plan-step";
import { getActiveSeason } from "@/lib/billing/wager-window-server";
import { canBookSeasonPassPure } from "@/lib/billing/wager-window";

const STEPS = [
  { label: "Verein suchen", href: "/onboarding/verein/1" },
  { label: "Mannschaft & Plan", href: "/onboarding/verein/2" },
  { label: "Stammdaten", href: "/onboarding/verein/3" },
  { label: "Verifikation", href: "/onboarding/verein/4" },
  { label: "Sponsoren einladen", href: "/onboarding/verein/5" }
];

export default async function Step2Page() {
  const today = new Date();
  let activeSeason = null;
  try {
    activeSeason = await getActiveSeason(today);
  } catch {
    // DB nicht erreichbar (z.B. Build-Step) → fallback null.
  }
  const seasonOpen = canBookSeasonPassPure(activeSeason, today);

  return (
    <div className="space-y-6 md:space-y-10">
      <WizardProgress steps={STEPS} currentStep={2} />
      <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
        <TeamPlanStep
          seasonOpen={seasonOpen}
          seasonCode={activeSeason?.code ?? null}
          matchdayFiveAtIso={
            activeSeason?.matchdayFiveAt?.toISOString() ?? null
          }
        />
      </Suspense>
    </div>
  );
}
