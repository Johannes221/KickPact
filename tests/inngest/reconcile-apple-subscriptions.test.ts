import { beforeEach, describe, expect, it, vi } from "vitest";

// ───────────────────────── Mock-Setup ──────────────────────────

const {
  isAppleApiConfiguredMock,
  getSubscriptionStatusMock,
  listAppleSubscriptionsForReconcileMock,
  setAppleStatusForClubMock,
  setTeamLicensesStatusForClubTeamsMock
} = vi.hoisted(() => ({
  isAppleApiConfiguredMock: vi.fn(),
  getSubscriptionStatusMock: vi.fn(),
  listAppleSubscriptionsForReconcileMock: vi.fn(),
  setAppleStatusForClubMock: vi.fn(),
  setTeamLicensesStatusForClubTeamsMock: vi.fn()
}));

vi.mock("@/lib/apple/api-client", () => ({
  isAppleApiConfigured: isAppleApiConfiguredMock,
  getSubscriptionStatus: getSubscriptionStatusMock
}));

vi.mock("@/lib/db/queries/subscriptions", () => ({
  listAppleSubscriptionsForReconcile: listAppleSubscriptionsForReconcileMock,
  setAppleStatusForClub: setAppleStatusForClubMock,
  setTeamLicensesStatusForClubTeams: setTeamLicensesStatusForClubTeamsMock
}));

import { reconcileAppleSubscriptions } from "@/lib/inngest/functions/reconcile-apple-subscriptions";

// ───────────────────────── Helpers ──────────────────────────

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> =>
      await fn()
  };
}

function createLoggerStub() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function runCron() {
  const fn = (
    reconcileAppleSubscriptions as unknown as {
      fn: (ctx: {
        step: ReturnType<typeof createStepStub>;
        logger: ReturnType<typeof createLoggerStub>;
      }) => Promise<unknown>;
    }
  ).fn;
  return fn({ step: createStepStub(), logger: createLoggerStub() });
}

// ───────────────────────── Tests ──────────────────────────

describe("reconcileAppleSubscriptions (cron)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAppleApiConfiguredMock.mockReturnValue(true);
    listAppleSubscriptionsForReconcileMock.mockResolvedValue([]);
    setAppleStatusForClubMock.mockResolvedValue(undefined);
    setTeamLicensesStatusForClubTeamsMock.mockResolvedValue(undefined);
  });

  it("returned früh, wenn die Apple-API nicht konfiguriert ist", async () => {
    isAppleApiConfiguredMock.mockReturnValue(false);

    const result = await runCron();

    expect(result).toEqual({ skipped: "apple-api-not-configured" });
    expect(listAppleSubscriptionsForReconcileMock).not.toHaveBeenCalled();
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
    expect(setAppleStatusForClubMock).not.toHaveBeenCalled();
  });

  it("kündigt, wenn Apple cancelled meldet aber die DB noch active hält", async () => {
    const expiresAt = new Date("2026-01-01T00:00:00Z");
    listAppleSubscriptionsForReconcileMock.mockResolvedValue([
      { clubId: "club_lost", originalTransactionId: "otx_lost" }
    ]);
    getSubscriptionStatusMock.mockResolvedValue({
      status: "cancelled",
      expiresAt
    });

    const result = await runCron();

    expect(getSubscriptionStatusMock).toHaveBeenCalledWith("otx_lost");
    expect(setAppleStatusForClubMock).toHaveBeenCalledWith(
      "club_lost",
      "cancelled",
      expiresAt
    );
    expect(setTeamLicensesStatusForClubTeamsMock).toHaveBeenCalledWith(
      "club_lost",
      "cancelled"
    );
    expect(result).toEqual({ checked: 1, cancelled: 1 });
  });

  it("kündigt NICHT, wenn Apple das Abo weiter als active führt", async () => {
    const expiresAt = new Date("2027-06-30T00:00:00Z");
    listAppleSubscriptionsForReconcileMock.mockResolvedValue([
      { clubId: "club_ok", originalTransactionId: "otx_ok" }
    ]);
    getSubscriptionStatusMock.mockResolvedValue({
      status: "active",
      expiresAt
    });

    const result = await runCron();

    // Status wird aufgefrischt (active + neues expiresAt), aber NIE cancelled
    // und KEINE Lizenz-Schließung.
    expect(setAppleStatusForClubMock).toHaveBeenCalledWith(
      "club_ok",
      "active",
      expiresAt
    );
    expect(setTeamLicensesStatusForClubTeamsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, cancelled: 0 });
  });

  it("überspringt unknown-Status ohne DB-Schreibzugriff", async () => {
    listAppleSubscriptionsForReconcileMock.mockResolvedValue([
      { clubId: "club_unknown", originalTransactionId: "otx_unknown" }
    ]);
    getSubscriptionStatusMock.mockResolvedValue({
      status: "unknown",
      expiresAt: null
    });

    const result = await runCron();

    expect(setAppleStatusForClubMock).not.toHaveBeenCalled();
    expect(setTeamLicensesStatusForClubTeamsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, cancelled: 0 });
  });
});
