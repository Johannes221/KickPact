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
  getSubscriptionGateMock,
  getTeamLicensePlanMock,
  countPledgeRulesMock,
  assertCanAddSponsorMock,
  getActiveSeasonMock,
  getSeasonWindowForTeamMock,
  assertWagerWindowOpenMock,
  findSponsorMock,
  createSponsorProfileMock,
  getClubIdForTeamMock,
  createPledgeWithRulesMock,
  getTeamDataCoverageMock
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  findInvitationMock: vi.fn(),
  getSubscriptionGateMock: vi.fn(),
  getTeamLicensePlanMock: vi.fn(),
  countPledgeRulesMock: vi.fn(),
  assertCanAddSponsorMock: vi.fn(),
  getActiveSeasonMock: vi.fn(),
  getSeasonWindowForTeamMock: vi.fn(),
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
  pledgeInputSchema: {
    parse: (v: unknown) => v,
    // C1 (Audit 2026-06-11): createPledge nutzt safeParse statt parse.
    safeParse: (v: unknown) => ({ success: true, data: v })
  },
  normalizeTriggerParams: (p: unknown) => p ?? {}
}));

vi.mock("@/lib/db/queries/invitations", () => ({
  findInvitationByToken: findInvitationMock,
  // Einladung wird jetzt atomar VOR der Pledge-Erzeugung konsumiert; hier immer
  // erfolgreich (true), damit die Coverage-/Tier-Gate-Tests den Consume-Guard
  // passieren.
  markInvitationUsed: async () => true
}));

vi.mock("@/lib/db/queries/subscription-status", () => ({
  // createPledge liest das Read-Only-Gate team-scoped (effektiver Lizenz-Verein).
  getSubscriptionGateForTeam: getSubscriptionGateMock
}));

vi.mock("@/lib/db/queries/team-lifecycle", () => ({
  // createPledge gated den Invite-Pfad auf isActive (deaktivierte Mannschaft
  // nimmt keine neuen Pacts auf) — hier standardmäßig aktiv.
  getTeamActivation: vi.fn().mockResolvedValue({ isActive: true, verifiedAt: new Date() })
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
  getActiveSeason: getActiveSeasonMock,
  // W1.2: createPledge bezieht das Fenster jetzt aus der TEAM-Saison.
  getSeasonWindowForTeam: getSeasonWindowForTeamMock
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
  idempotencyKey: "idem-key-abc123",
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
  getSeasonWindowForTeamMock.mockResolvedValue({
    id: "season-2627",
    code: "2627",
    matchdayFiveAt: new Date("2026-09-15T23:59:59Z")
  });
  assertWagerWindowOpenMock.mockReturnValue(undefined);
  // Sponsor existiert → kein Lazy-Create. Team-Lookup liefert clubId.
  findSponsorMock.mockResolvedValue({ id: "sp-1" });
  createSponsorProfileMock.mockResolvedValue({ id: "sp-1" });
  getClubIdForTeamMock.mockResolvedValue("club-1");
  createPledgeWithRulesMock.mockResolvedValue({ pledgeId: "pledge-1" });
  // Default: volle Daten-Coverage → kein Coverage-Gate (Bestand schonen).
  getTeamDataCoverageMock.mockResolvedValue("full");
});

describe("createPledge — Tier-Gate fuer Saison-Wetten (Audit #4)", () => {
  it("basic-Tier + season_* Trigger → ok:false mit Saison-Wetten-Meldung", async () => {
    getTeamLicensePlanMock.mockResolvedValue("basic");
    await expect(createPledge(VALID_INPUT)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/Saison-Ziele/i)
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

  it("results_only + goal_by_player → ok:false (Spieler-Regel geblockt)", async () => {
    getTeamDataCoverageMock.mockResolvedValue("results_only");
    await expect(createPledge(playerRuleInput)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/Spieler-Regeln/i)
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

  it("none → Ergebnis-Regeln erlaubt (manueller Flow), Spieler-Regeln geblockt (Review K1, Phase 4)", async () => {
    // Seit Phase 4 sind none-Teams onboardbar: alles läuft über manuelle
    // Meldung + Sponsor-Bestätigung (applyCoverageApprovalPolicy erzwingt
    // pending_approval in evaluate-match). Nur Auto-Spieler-Regeln bleiben zu.
    getTeamDataCoverageMock.mockResolvedValue("none");
    await expect(createPledge(resultRuleInput)).resolves.toEqual({
      ok: true,
      pledgeId: "pledge-1"
    });
    await expect(createPledge(playerRuleInput)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/Spieler-Regeln/i)
    });
  });
});
