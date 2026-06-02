import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  CYCLE_ORDER,
  PLAN_CAPS,
  TRIAL_DAYS,
  SEASON_PAUSE_MONTHS,
  getStripePriceId,
  getMonthlyEquivalent,
  getSavings,
  priceIdToPlanCycle,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";

describe("PRICING table", () => {
  it("contains all 6 plan/cycle combinations with positive amountCents", () => {
    for (const plan of PLAN_ORDER) {
      for (const cycle of CYCLE_ORDER) {
        const def = PLANS[plan].cycles[cycle];
        expect(def, `${plan}/${cycle}`).toBeDefined();
        expect(def.amountCents, `${plan}/${cycle}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses canonical Concept-D prices from docs/pricing.md", () => {
    expect(PLANS.basic.cycles.monthly.amountCents).toBe(500);
    expect(PLANS.basic.cycles.season_end.amountCents).toBe(3900);
    expect(PLANS.pro.cycles.monthly.amountCents).toBe(1900);
    expect(PLANS.pro.cycles.season_end.amountCents).toBe(14900);
    expect(PLANS.verein.cycles.monthly.amountCents).toBe(4900);
    expect(PLANS.verein.cycles.season_end.amountCents).toBe(38900);
  });
});

describe("getMonthlyEquivalent", () => {
  it("monthly cycle returns the monthly price itself", () => {
    expect(getMonthlyEquivalent("basic", "monthly")).toBe(500);
    expect(getMonthlyEquivalent("pro", "monthly")).toBe(1900);
  });

  it("season cycle divides by 10 (Aug–Mai aktive Monate)", () => {
    expect(getMonthlyEquivalent("basic", "season_end")).toBe(390);
    expect(getMonthlyEquivalent("pro", "season_end")).toBe(1490);
    expect(getMonthlyEquivalent("verein", "season_end")).toBe(3890);
  });
});

describe("getSavings", () => {
  it("monthly cycle has no savings", () => {
    expect(getSavings("pro", "monthly")).toEqual({
      absoluteCents: 0,
      percent: 0
    });
  });

  it("pro season ≈ 35 % cheaper than 12× monthly", () => {
    // 12 × 19€ = 228€; Saison-Pass = 149€ → 79€ Ersparnis ≈ 34,6 %
    const { absoluteCents, percent } = getSavings("pro", "season_end");
    expect(absoluteCents).toBe(7900);
    expect(percent).toBeGreaterThanOrEqual(34);
    expect(percent).toBeLessThanOrEqual(35);
  });

  it("verein season ≈ 34 % cheaper than 12× monthly", () => {
    // 12 × 49€ = 588€; Saison-Pass = 389€ → 199€ Ersparnis ≈ 33,8 %
    const { absoluteCents, percent } = getSavings("verein", "season_end");
    expect(absoluteCents).toBe(19900);
    expect(percent).toBeGreaterThanOrEqual(33);
    expect(percent).toBeLessThanOrEqual(34);
  });
});

describe("PLAN_CAPS", () => {
  it("basic has 5 sponsors / 3 rules caps", () => {
    expect(PLAN_CAPS.basic.maxSponsorsPerTeam).toBe(5);
    expect(PLAN_CAPS.basic.maxPledgeRulesPerSponsor).toBe(3);
  });

  it("pro and verein are uncapped (null)", () => {
    expect(PLAN_CAPS.pro.maxSponsorsPerTeam).toBeNull();
    expect(PLAN_CAPS.pro.maxPledgeRulesPerSponsor).toBeNull();
    expect(PLAN_CAPS.verein.maxSponsorsPerTeam).toBeNull();
    expect(PLAN_CAPS.verein.maxPledgeRulesPerSponsor).toBeNull();
  });
});

describe("constants", () => {
  it("TRIAL_DAYS = 30", () => {
    expect(TRIAL_DAYS).toBe(30);
  });

  it("SEASON_PAUSE_MONTHS = [6, 7] (Jun, Jul)", () => {
    expect([...SEASON_PAUSE_MONTHS]).toEqual([6, 7]);
  });
});

describe("getStripePriceId", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // Wipe all matching env-vars first
    for (const plan of PLAN_ORDER) {
      for (const cycle of CYCLE_ORDER) {
        delete process.env[`STRIPE_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID`];
      }
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reads price ID from env-var matching the plan+cycle pattern", () => {
    process.env.STRIPE_PRO_SEASON_END_PRICE_ID = "price_test_pro_season";
    expect(getStripePriceId("pro", "season_end")).toBe("price_test_pro_season");
  });

  it("returns null when env-var is not set", () => {
    expect(getStripePriceId("basic", "season_end")).toBeNull();
  });
});

describe("priceIdToPlanCycle", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const plan of PLAN_ORDER) {
      for (const cycle of CYCLE_ORDER) {
        delete process.env[`STRIPE_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID`];
      }
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reverse-looks-up a Stripe price ID to plan+cycle", () => {
    process.env.STRIPE_VEREIN_SEASON_END_PRICE_ID = "price_abc";
    const result = priceIdToPlanCycle("price_abc");
    expect(result).toEqual<{ plan: PlanKey; cycle: BillingCycle }>({
      plan: "verein",
      cycle: "season_end"
    });
  });

  it("returns null when the price ID is unknown", () => {
    expect(priceIdToPlanCycle("price_unknown")).toBeNull();
  });
});
