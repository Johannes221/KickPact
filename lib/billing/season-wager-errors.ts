import type { PlanKey } from "@/lib/stripe/pricing";

/**
 * Saison-Wetten (triggerType = `season_*`) sind Pro/Verein-only Features
 * laut docs/pricing.md §5 + §8. Wird vom Pricing-v2-Audit-Fix #4
 * (2026-05-24) als Hard-Gate vor Pledge-Insert geworfen.
 */
export class SeasonWagerNotAllowedError extends Error {
  readonly plan: PlanKey;
  constructor(plan: PlanKey) {
    super(
      `Saison-Wetten sind im ${plan}-Tier nicht verfügbar. ` +
        `Bitte Verein auf Pro oder Vereinslizenz upgraden.`
    );
    this.name = "SeasonWagerNotAllowedError";
    this.plan = plan;
  }
}
