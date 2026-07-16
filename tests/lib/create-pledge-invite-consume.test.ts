/**
 * Launch-Blocker Go-Live 2026-07-10 — Broadcast-Invite vs. 1:1-Invite.
 *
 * `createPledge` darf einen Broadcast-Sponsor-Link (singleUse=false) NICHT
 * verbrauchen — sonst wäre der Link nach dem ersten Sponsor tot (Widerspruch
 * zum „teile den Link an viele"-Modell). Ein 1:1-Link aus dem Inquiry-Accept
 * (singleUse=true) bleibt single-use und wird atomar via markInvitationUsed
 * konsumiert. Der Doppel-Submit-Schutz läuft in BEIDEN Fällen über den
 * idempotencyKey, der an createPledgeWithRules durchgereicht wird.
 *
 * Vollständig gemockt (wie pledges-tier-gate.test.ts) — hier zählt die
 * Verzweigungs-Logik, nicht der DB-Pfad (der lebt in pledge-idempotency.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireUserMock,
  findInvitationMock,
  markInvitationUsedMock,
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
  markInvitationUsedMock: vi.fn(),
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

vi.mock("@/lib/auth/session", () => ({ requireUser: requireUserMock }));

vi.mock("@/lib/validations/pledge", () => ({
  pledgeInputSchema: {
    parse: (v: unknown) => v,
    safeParse: (v: unknown) => ({ success: true, data: v })
  },
  normalizeTriggerParams: (p: unknown) => p ?? {},
  pledgeRulesetSignature: () => "sig"
}));

vi.mock("@/lib/db/queries/invitations", () => ({
  findInvitationByToken: findInvitationMock,
  markInvitationUsed: markInvitationUsedMock
}));

vi.mock("@/lib/db/queries/subscription-status", () => ({
  getSubscriptionGateForTeam: getSubscriptionGateMock
}));

vi.mock("@/lib/db/queries/team-lifecycle", () => ({
  getTeamActivation: vi.fn().mockResolvedValue({ isActive: true, verifiedAt: new Date() })
}));

vi.mock("@/lib/billing/plan-features", () => ({
  assertCanAddSponsorToTeam: assertCanAddSponsorMock,
  PlanCapExceededError: class PlanCapExceededError extends Error {}
}));

vi.mock("@/lib/db/queries/pledges", () => ({
  getTeamLicensePlan: getTeamLicensePlanMock,
  countPledgeRulesForSponsorOnTeam: countPledgeRulesMock,
  listActivePledgeRuleRowsForSponsorOnTeam: vi.fn().mockResolvedValue([]),
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
  WagerWindowClosedError: class WagerWindowClosedError extends Error {}
}));

vi.mock("@/lib/billing/wager-window-server", () => ({
  getActiveSeason: getActiveSeasonMock,
  getSeasonWindowForTeam: getSeasonWindowForTeamMock
}));

vi.mock("@/lib/db/schema/pledges", () => ({
  isSeasonTrigger: (t: string) => t.startsWith("season_")
}));

vi.mock("@/lib/db/client", () => ({ db: {} }));

vi.mock("@/lib/db/queries/sponsor-label", () => ({
  deriveSponsorDisplayName: () => "Test-Sponsor"
}));

import { createPledge } from "@/app/(sponsor)/sponsor/pledge/new/_actions/create-pledge";

const INPUT = {
  invitationToken: "tok-broadcast",
  idempotencyKey: "idem-key-abc123",
  endsAtSaisonEnd: true,
  monthlyCapEur: null,
  rules: [{ triggerType: "goal_total", params: {}, amountEur: 5 }]
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", email: "s@x.de" });
  getSubscriptionGateMock.mockResolvedValue({ isReadOnly: false });
  assertCanAddSponsorMock.mockResolvedValue(undefined);
  countPledgeRulesMock.mockResolvedValue(0);
  getTeamLicensePlanMock.mockResolvedValue("pro");
  getActiveSeasonMock.mockResolvedValue({ code: "2526" });
  getSeasonWindowForTeamMock.mockResolvedValue({ code: "2627" });
  assertWagerWindowOpenMock.mockReturnValue(undefined);
  findSponsorMock.mockResolvedValue({ id: "sp-1" });
  createSponsorProfileMock.mockResolvedValue({ id: "sp-1" });
  getClubIdForTeamMock.mockResolvedValue("club-1");
  createPledgeWithRulesMock.mockResolvedValue({ pledgeId: "pledge-1" });
  getTeamDataCoverageMock.mockResolvedValue("full");
  markInvitationUsedMock.mockResolvedValue(true);
});

describe("createPledge — Broadcast-Invite (singleUse=false)", () => {
  beforeEach(() => {
    findInvitationMock.mockResolvedValue({
      teamId: "team-1",
      status: "pending",
      singleUse: false
    });
  });

  it("verbraucht den Token NICHT (Link bleibt für weitere Sponsoren gültig)", async () => {
    await expect(createPledge(INPUT)).resolves.toEqual({ ok: true, pledgeId: "pledge-1" });
    expect(markInvitationUsedMock).not.toHaveBeenCalled();
  });

  it("reicht den idempotencyKey an createPledgeWithRules durch", async () => {
    await createPledge(INPUT);
    expect(createPledgeWithRulesMock).toHaveBeenCalledTimes(1);
    const arg = createPledgeWithRulesMock.mock.calls[0][0];
    expect(arg.pledge.idempotencyKey).toBe("idem-key-abc123");
  });
});

describe("createPledge — 1:1-Invite (singleUse=true)", () => {
  beforeEach(() => {
    findInvitationMock.mockResolvedValue({
      teamId: "team-1",
      status: "pending",
      singleUse: true
    });
  });

  it("konsumiert den Token atomar via markInvitationUsed", async () => {
    await expect(createPledge(INPUT)).resolves.toEqual({ ok: true, pledgeId: "pledge-1" });
    expect(markInvitationUsedMock).toHaveBeenCalledTimes(1);
    expect(markInvitationUsedMock).toHaveBeenCalledWith("tok-broadcast", "u1");
  });

  it("zweite Einlösung (markInvitationUsed → false) → ok:false, kein Pledge", async () => {
    markInvitationUsedMock.mockResolvedValue(false);
    await expect(createPledge(INPUT)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/bereits eingelöst/i)
    });
    expect(createPledgeWithRulesMock).not.toHaveBeenCalled();
  });
});
