import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canAddPledgeRuleOnPlan,
  canAddSponsorOnPlan
} from "@/lib/billing/plan-features";
import { PLAN_CAPS } from "@/lib/stripe/pricing";

// ---------- Pure helpers ----------

describe("canAddSponsorOnPlan (pure)", () => {
  it("basic mit 4 Sponsoren → 5. erlaubt", () => {
    expect(canAddSponsorOnPlan("basic", 4)).toBe(true);
  });

  it("basic mit 5 Sponsoren → 6. nicht erlaubt", () => {
    expect(canAddSponsorOnPlan("basic", 5)).toBe(false);
  });

  it("pro mit 50 Sponsoren → erlaubt (uncapped)", () => {
    expect(canAddSponsorOnPlan("pro", 50)).toBe(true);
  });

  it("verein mit 200 Sponsoren → erlaubt", () => {
    expect(canAddSponsorOnPlan("verein", 200)).toBe(true);
  });
});

describe("canAddPledgeRuleOnPlan (pure)", () => {
  it("basic mit 2 Rules → 3. erlaubt", () => {
    expect(canAddPledgeRuleOnPlan("basic", 2)).toBe(true);
  });

  it("basic mit 3 Rules → 4. nicht erlaubt", () => {
    expect(canAddPledgeRuleOnPlan("basic", 3)).toBe(false);
  });

  it("pro uncapped", () => {
    expect(canAddPledgeRuleOnPlan("pro", 99)).toBe(true);
  });
});

// ---------- Mocked DB asserts ----------

vi.mock("@/lib/db/queries/pledges", () => ({
  getTeamLicensePlan: vi.fn(),
  countActiveSponsorsForTeam: vi.fn(),
  countPledgeRulesForSponsorOnTeam: vi.fn()
}));

import {
  assertCanAddSponsorToTeam,
  assertCanAddPledgeRule,
  PlanCapExceededError
} from "@/lib/billing/plan-features";
import * as pledgesQueries from "@/lib/db/queries/pledges";

describe("assertCanAddSponsorToTeam (DB-mocked)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("basic mit 4 Sponsoren → 5. läuft durch", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("basic");
    vi.mocked(pledgesQueries.countPledgeRulesForSponsorOnTeam).mockResolvedValue(0);
    vi.mocked(pledgesQueries.countActiveSponsorsForTeam).mockResolvedValue(4);
    await expect(
      assertCanAddSponsorToTeam("team-1", "sponsor-new")
    ).resolves.toBeUndefined();
  });

  it("basic mit 5 Sponsoren → 6. wirft PlanCapExceededError", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("basic");
    vi.mocked(pledgesQueries.countPledgeRulesForSponsorOnTeam).mockResolvedValue(0);
    vi.mocked(pledgesQueries.countActiveSponsorsForTeam).mockResolvedValue(5);
    await expect(
      assertCanAddSponsorToTeam("team-1", "sponsor-new")
    ).rejects.toBeInstanceOf(PlanCapExceededError);
  });

  it("pro: 50 Sponsoren → kein Cap", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("pro");
    await expect(
      assertCanAddSponsorToTeam("team-1", "sponsor-new")
    ).resolves.toBeUndefined();
  });

  it("verein: kein Cap", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("verein");
    await expect(
      assertCanAddSponsorToTeam("team-1", "sponsor-new")
    ).resolves.toBeUndefined();
  });

  it("bestehender Sponsor (Rules > 0) zählt nicht doppelt → kein Throw bei Cap=5", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("basic");
    vi.mocked(pledgesQueries.countPledgeRulesForSponsorOnTeam).mockResolvedValue(2);
    vi.mocked(pledgesQueries.countActiveSponsorsForTeam).mockResolvedValue(5);
    await expect(
      assertCanAddSponsorToTeam("team-1", "sponsor-existing")
    ).resolves.toBeUndefined();
  });
});

describe("assertCanAddPledgeRule (DB-mocked)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("basic-Sponsor mit 3 Rules → 4. wirft PlanCapExceededError", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("basic");
    vi.mocked(pledgesQueries.countPledgeRulesForSponsorOnTeam).mockResolvedValue(3);
    await expect(
      assertCanAddPledgeRule("sponsor-1", "team-1")
    ).rejects.toBeInstanceOf(PlanCapExceededError);
  });

  it("basic-Sponsor mit 2 Rules → 3. erlaubt", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("basic");
    vi.mocked(pledgesQueries.countPledgeRulesForSponsorOnTeam).mockResolvedValue(2);
    await expect(
      assertCanAddPledgeRule("sponsor-1", "team-1")
    ).resolves.toBeUndefined();
  });

  it("pro/verein: kein Cap", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("pro");
    await expect(
      assertCanAddPledgeRule("sponsor-1", "team-1")
    ).resolves.toBeUndefined();
  });

  it("Error trägt Cap-Wert + Plan + aktuelle Anzahl", async () => {
    vi.mocked(pledgesQueries.getTeamLicensePlan).mockResolvedValue("basic");
    vi.mocked(pledgesQueries.countPledgeRulesForSponsorOnTeam).mockResolvedValue(3);
    try {
      await assertCanAddPledgeRule("sponsor-1", "team-1");
    } catch (e) {
      const err = e as PlanCapExceededError;
      expect(err.cap).toBe("pledge_rules");
      expect(err.limit).toBe(PLAN_CAPS.basic.maxPledgeRulesPerSponsor);
      expect(err.current).toBe(3);
      expect(err.plan).toBe("basic");
      return;
    }
    throw new Error("Expected throw");
  });
});
