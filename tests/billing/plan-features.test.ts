import { describe, it, expect } from "vitest";
import { FEATURE_BY_PLAN } from "@/lib/billing/plan-features-catalog";
import { PLAN_CAPS, PLAN_ORDER } from "@/lib/stripe/pricing";

describe("FEATURE_BY_PLAN", () => {
  it("covers every plan", () => {
    for (const plan of PLAN_ORDER) {
      expect(FEATURE_BY_PLAN[plan], plan).toBeDefined();
    }
  });

  it("basic caps match the canonical PLAN_CAPS", () => {
    expect(FEATURE_BY_PLAN.basic.maxSponsorsPerTeam).toBe(
      PLAN_CAPS.basic.maxSponsorsPerTeam
    );
    expect(FEATURE_BY_PLAN.basic.maxPledgeRulesPerSponsor).toBe(
      PLAN_CAPS.basic.maxPledgeRulesPerSponsor
    );
  });

  it("pro + verein are uncapped (null)", () => {
    expect(FEATURE_BY_PLAN.pro.maxSponsorsPerTeam).toBeNull();
    expect(FEATURE_BY_PLAN.verein.maxSponsorsPerTeam).toBeNull();
  });

  it("each plan ships a non-empty upgrade headline + feature list", () => {
    for (const plan of PLAN_ORDER) {
      expect(FEATURE_BY_PLAN[plan].upgradeHeadline.length).toBeGreaterThan(0);
      expect(FEATURE_BY_PLAN[plan].highlights.length).toBeGreaterThan(0);
    }
  });
});
