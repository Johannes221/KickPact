import { describe, it, expect, vi, beforeEach } from "vitest";

// Pricing-v2-Audit Finding #4 (2026-05-24): Saison-Wetten muessen auf
// Basic-Tier hart geblockt werden. Diese Tests fahren createPledge mit
// gemockten DB-Layern und stellen sicher, dass:
// - basic-Plan + season_* Trigger → SeasonWagerNotAllowedError
// - pro/verein-Plan + season_* Trigger → kein Tier-Gate
// - basic-Plan + normaler Trigger → kein Tier-Gate

const {
  requireUserMock,
  findInvitationMock,
  markInvitationUsedMock,
  getSubscriptionGateMock,
  getTeamLicensePlanMock,
  countPledgeRulesMock,
  assertCanAddSponsorMock,
  getActiveSeasonMock,
  assertWagerWindowOpenMock,
  findSponsorMock,
  createSponsorProfileMock,
  getClubIdForTeamMock,
  createPledgeWithRulesMock,
  isClubMemberMock,
  getTeamMembershipRoleMock
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  findInvitationMock: vi.fn(),
  markInvitationUsedMock: vi.fn(),
  getSubscriptionGateMock: vi.fn(),
  getTeamLicensePlanMock: vi.fn(),
  countPledgeRulesMock: vi.fn(),
  assertCanAddSponsorMock: vi.fn(),
  getActiveSeasonMock: vi.fn(),
  assertWagerWindowOpenMock: vi.fn(),
  findSponsorMock: vi.fn(),
  createSponsorProfileMock: vi.fn(),
  getClubIdForTeamMock: vi.fn(),
  createPledgeWithRulesMock: vi.fn(),
  isClubMemberMock: vi.fn(),
  getTeamMembershipRoleMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));

vi.mock("@/lib/validations/pledge", () => ({
  pledgeInputSchema: { parse: (v: unknown) => v },
  normalizeTriggerParams: (p: unknown) => p ?? {}
}));

vi.mock("@/lib/db/queries/invitations", () => ({
  findInvitationByToken: findInvitationMock,
  markInvitationUsed: markInvitationUsedMock
}));

vi.mock("@/lib/db/queries/subscription-status", () => ({
  getSubscriptionGate: getSubscriptionGateMock
}));

vi.mock("@/lib/billing/plan-features", () => ({
  assertCanAddSponsorToTeam: assertCanAddSponsorMock,
  PlanCapExceededError: class PlanCapExceededError extends Error {
    cap: string;
    limit: number;
    current: number;
    plan: string;
    constructor(cap: string, limit: number, current: number, plan: string) {
      super("cap exceeded");
      this.cap = cap;
      this.limit = limit;
      this.current = current;
      this.plan = plan;
    }
  }
}));

vi.mock("@/lib/db/queries/pledges", () => ({
  getTeamLicensePlan: getTeamLicensePlanMock,
  countPledgeRulesForSponsorOnTeam: countPledgeRulesMock,
  getClubIdForTeam: getClubIdForTeamMock,
  createPledgeWithRules: createPledgeWithRulesMock
}));

vi.mock("@/lib/db/queries/sponsor-dashboard", () => ({
  findSponsorForUser: findSponsorMock,
  createSponsorProfile: createSponsorProfileMock
}));

vi.mock("@/lib/db/queries/membership-requests", () => ({
  isClubMember: isClubMemberMock,
  getTeamMembershipRole: getTeamMembershipRoleMock
}));

vi.mock("@/lib/billing/wager-window", () => ({
  assertWagerWindowOpen: assertWagerWindowOpenMock,
  WagerWindowClosedError: class WagerWindowClosedError extends Error {
    seasonCode?: string;
  }
}));

vi.mock("@/lib/billing/wager-window-server", () => ({
  getActiveSeason: getActiveSeasonMock
}));

vi.mock("@/lib/db/schema/pledges", () => ({
  isSeasonTrigger: (t: string) => t.startsWith("season_")
}));

// createPledge greift seit dem Query-Layer-Refactor (Batch 5c) NICHT mehr direkt
// auf den db-Client zu — alle Zugriffe laufen über die gemockten Query-Funktionen.
// Der Stub verhindert nur, dass transitive Imports eine echte DB-Verbindung öffnen.
vi.mock("@/lib/db/client", () => ({ db: {} }));

// sponsor-label transitiv mocken, damit nicht das reale DB-Schema geladen wird
// (deriveSponsorDisplayName wird beim Lazy-Sponsor-Create gebraucht).
vi.mock("@/lib/db/queries/sponsor-label", () => ({
  deriveSponsorDisplayName: () => "Test-Sponsor"
}));

import { createPledge } from "@/app/(sponsor)/sponsor/pledge/new/_actions/create-pledge";
import { SeasonWagerNotAllowedError } from "@/lib/billing/season-wager-errors";

const VALID_INPUT = {
  invitationToken: "tok-1",
  endsAtSaisonEnd: true,
  monthlyCapEur: null,
  rules: [
    {
      triggerType: "season_promotion",
      params: {},
      amountEur: 5,
      perMatchCapEur: null
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", email: "s@x.de" });
  findInvitationMock.mockResolvedValue({
    teamId: "team-1",
    status: "pending"
  });
  getSubscriptionGateMock.mockResolvedValue({ isReadOnly: false });
  assertCanAddSponsorMock.mockResolvedValue(undefined);
  countPledgeRulesMock.mockResolvedValue(0);
  getActiveSeasonMock.mockResolvedValue({
    code: "2526",
    startsAt: new Date("2025-08-01T00:00:00Z"),
    endsAt: new Date("2026-05-31T23:59:59Z")
  });
  assertWagerWindowOpenMock.mockReturnValue(undefined);
  // Sponsor existiert → kein Lazy-Create. Team-Lookup liefert clubId.
  findSponsorMock.mockResolvedValue({ id: "sp-1" });
  createSponsorProfileMock.mockResolvedValue({ id: "sp-1" });
  getClubIdForTeamMock.mockResolvedValue("club-1");
  // Self-Dealing-Check (L6): User ist weder Club- noch Team-Mitglied.
  isClubMemberMock.mockResolvedValue(false);
  getTeamMembershipRoleMock.mockResolvedValue(null);
  createPledgeWithRulesMock.mockResolvedValue({ pledgeId: "pledge-1" });
  markInvitationUsedMock.mockResolvedValue(undefined);
});

describe("createPledge — Tier-Gate fuer Saison-Wetten (Audit #4)", () => {
  it("basic-Tier + season_* Trigger → SeasonWagerNotAllowedError", async () => {
    getTeamLicensePlanMock.mockResolvedValue("basic");
    await expect(createPledge(VALID_INPUT)).rejects.toBeInstanceOf(
      SeasonWagerNotAllowedError
    );
  });

  it("pro-Tier + season_* Trigger → kein Tier-Gate", async () => {
    getTeamLicensePlanMock.mockResolvedValue("pro");
    await expect(createPledge(VALID_INPUT)).resolves.toEqual({
      pledgeId: "pledge-1"
    });
  });

  it("verein-Tier + season_* Trigger → kein Tier-Gate", async () => {
    getTeamLicensePlanMock.mockResolvedValue("verein");
    await expect(createPledge(VALID_INPUT)).resolves.toEqual({
      pledgeId: "pledge-1"
    });
  });

  it("basic-Tier + nicht-season Trigger → kein Tier-Gate", async () => {
    getTeamLicensePlanMock.mockResolvedValue("basic");
    const input = {
      ...VALID_INPUT,
      rules: [
        {
          triggerType: "goal",
          params: {},
          amountEur: 5,
          perMatchCapEur: null
        }
      ]
    };
    await expect(createPledge(input)).resolves.toEqual({
      pledgeId: "pledge-1"
    });
  });
});
