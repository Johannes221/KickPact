import { describe, it, expect, vi, beforeEach } from "vitest";

// Pricing-v2-Audit Finding #4 (2026-05-24): Saison-Wetten muessen auf
// Basic-Tier hart geblockt werden. Diese Tests fahren createPledge mit
// gemockten DB-Layern und stellen sicher, dass:
// - basic-Plan + season_* Trigger → { ok: false } mit Saison-Wetten-Meldung
// - pro/verein-Plan + season_* Trigger → kein Tier-Gate
// - basic-Plan + normaler Trigger → kein Tier-Gate
// Hinweis: createPledge wirft keine Business-Fehler mehr, sondern liefert
// { ok: false, message } zurück (Next.js redacted geworfene Action-Fehler).

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
  getTeamDataCoverageMock
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
  getTeamDataCoverageMock: vi.fn()
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

vi.mock("@/lib/db/queries/crawler", () => ({
  getTeamDataCoverage: getTeamDataCoverageMock
}));

vi.mock("@/lib/db/queries/sponsor-dashboard", () => ({
  findSponsorForUser: findSponsorMock,
  createSponsorProfile: createSponsorProfileMock
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
  createPledgeWithRulesMock.mockResolvedValue({ pledgeId: "pledge-1" });
  markInvitationUsedMock.mockResolvedValue(undefined);
  // Default: volle Daten-Coverage → kein Coverage-Gate (Bestand schonen).
  getTeamDataCoverageMock.mockResolvedValue("full");
});

describe("createPledge — Tier-Gate fuer Saison-Wetten (Audit #4)", () => {
  it("basic-Tier + season_* Trigger → ok:false mit Saison-Wetten-Meldung", async () => {
    getTeamLicensePlanMock.mockResolvedValue("basic");
    await expect(createPledge(VALID_INPUT)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/Saison-Wetten/i)
    });
  });

  it("pro-Tier + season_* Trigger → kein Tier-Gate", async () => {
    getTeamLicensePlanMock.mockResolvedValue("pro");
    await expect(createPledge(VALID_INPUT)).resolves.toEqual({
      ok: true,
      pledgeId: "pledge-1"
    });
  });

  it("verein-Tier + season_* Trigger → kein Tier-Gate", async () => {
    getTeamLicensePlanMock.mockResolvedValue("verein");
    await expect(createPledge(VALID_INPUT)).resolves.toEqual({
      ok: true,
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
      ok: true,
      pledgeId: "pledge-1"
    });
  });
});

describe("createPledge — Daten-Coverage-Gate", () => {
  const playerRuleInput = {
    ...VALID_INPUT,
    rules: [
      { triggerType: "goal_by_player", params: { player_name: "Müller" }, amountEur: 3, perMatchCapEur: null }
    ]
  };
  const resultRuleInput = {
    ...VALID_INPUT,
    rules: [{ triggerType: "goal_total", params: {}, amountEur: 5, perMatchCapEur: null }]
  };

  beforeEach(() => {
    getTeamLicensePlanMock.mockResolvedValue("pro");
  });

  it("results_only + goal_by_player → ok:false (Spieler-Wette geblockt)", async () => {
    getTeamDataCoverageMock.mockResolvedValue("results_only");
    await expect(createPledge(playerRuleInput)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/Spieler-Wetten/i)
    });
  });

  it("results_only + goal_total → erlaubt", async () => {
    getTeamDataCoverageMock.mockResolvedValue("results_only");
    await expect(createPledge(resultRuleInput)).resolves.toEqual({ ok: true, pledgeId: "pledge-1" });
  });

  it("full + goal_by_player → erlaubt", async () => {
    getTeamDataCoverageMock.mockResolvedValue("full");
    await expect(createPledge(playerRuleInput)).resolves.toEqual({ ok: true, pledgeId: "pledge-1" });
  });

  it("null (unklassifiziert) + goal_by_player → erlaubt (Grandfather)", async () => {
    getTeamDataCoverageMock.mockResolvedValue(null);
    await expect(createPledge(playerRuleInput)).resolves.toEqual({ ok: true, pledgeId: "pledge-1" });
  });

  it("none → komplett geblockt (auch Ergebnis-Wette)", async () => {
    getTeamDataCoverageMock.mockResolvedValue("none");
    await expect(createPledge(resultRuleInput)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/keine Spieldaten/i)
    });
  });
});
