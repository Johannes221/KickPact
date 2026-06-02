import { describe, expect, it } from "vitest";
import {
  computeImpactNumbers,
  BASIC_SPONSOR_CAP,
  BASIC_RULE_CAP
} from "@/lib/billing/downgrade-impact";

describe("computeImpactNumbers", () => {
  it("caps mirror PLAN_CAPS.basic (5 sponsors / 3 rules)", () => {
    expect(BASIC_SPONSOR_CAP).toBe(5);
    expect(BASIC_RULE_CAP).toBe(3);
  });

  it("returns all zeros for empty data", () => {
    expect(
      computeImpactNumbers({ perTeamSponsorCounts: [], perSponsorRuleCounts: [] })
    ).toEqual({ activeSponsors: 0, sponsorsOverCap: 0, rulesOverCap: 0 });
  });

  it("never reports over-cap when every team/sponsor is within Basic limits", () => {
    const r = computeImpactNumbers({
      perTeamSponsorCounts: [5, 3, 1],
      perSponsorRuleCounts: [3, 2, 1, 3]
    });
    expect(r.activeSponsors).toBe(9);
    expect(r.sponsorsOverCap).toBe(0);
    expect(r.rulesOverCap).toBe(0);
  });

  it("sums sponsors over the 5-cap across teams", () => {
    // Team A: 7 → 2 over; Team B: 6 → 1 over; Team C: 4 → 0.
    const r = computeImpactNumbers({
      perTeamSponsorCounts: [7, 6, 4],
      perSponsorRuleCounts: []
    });
    expect(r.activeSponsors).toBe(17);
    expect(r.sponsorsOverCap).toBe(3);
  });

  it("sums pledge-rules over the 3-cap per sponsor/team", () => {
    // 1→0, 3→0, 5→2, 4→1
    const r = computeImpactNumbers({
      perTeamSponsorCounts: [],
      perSponsorRuleCounts: [1, 3, 5, 4]
    });
    expect(r.rulesOverCap).toBe(3);
  });

  it("combines both dimensions independently", () => {
    const r = computeImpactNumbers({
      perTeamSponsorCounts: [8],
      perSponsorRuleCounts: [10]
    });
    expect(r.activeSponsors).toBe(8);
    expect(r.sponsorsOverCap).toBe(3); // 8 - 5
    expect(r.rulesOverCap).toBe(7); // 10 - 3
  });
});
