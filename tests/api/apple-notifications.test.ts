import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/apple/verifier", () => ({
  isAppleIapConfigured: () => true,
  verifyNotification: vi.fn()
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  hasStripeEventBeenProcessed: vi.fn(),
  markStripeEventProcessed: vi.fn(),
  getClubIdByOriginalTransactionId: vi.fn(),
  syncAppleSubscriptionForClub: vi.fn(),
  setTeamLicensesPlanForSubscription: vi.fn(),
  setTeamLicensesStatusForClubTeams: vi.fn()
}));

const { verifyNotification } = await import("@/lib/apple/verifier");
const subs = await import("@/lib/db/queries/subscriptions");
const { POST } = await import("@/app/api/apple/notifications/route");

function req(body: unknown) {
  return new Request("https://t.dev/api/apple/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (subs.hasStripeEventBeenProcessed as any).mockResolvedValue(false);
  (subs.markStripeEventProcessed as any).mockResolvedValue(true);
  (subs.getClubIdByOriginalTransactionId as any).mockResolvedValue("club_1");
});

describe("POST /api/apple/notifications", () => {
  it("401 on invalid signature, no write", async () => {
    (verifyNotification as any).mockRejectedValue(new Error("bad sig"));
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(401);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("DID_RENEW → active, writes + marks processed", async () => {
    (verifyNotification as any).mockResolvedValue({
      notificationType: "DID_RENEW",
      notificationUUID: "uuid_1",
      data: {
        signedTransactionInfo: {
          productId: "kickpact.pro.monthly",
          originalTransactionId: "otx_1",
          expiresDate: 1800000000000
        }
      }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).toHaveBeenCalledWith("club_1",
      expect.objectContaining({ status: "active", originalTransactionId: "otx_1" }));
    expect(subs.markStripeEventProcessed).toHaveBeenCalledWith("uuid_1", "DID_RENEW");
  });

  it("EXPIRED → cancelled + team licenses cancelled", async () => {
    (verifyNotification as any).mockResolvedValue({
      notificationType: "EXPIRED",
      notificationUUID: "uuid_2",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly", originalTransactionId: "otx_1", expiresDate: 0
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.setTeamLicensesStatusForClubTeams).toHaveBeenCalledWith("club_1", "cancelled");
  });

  it("deduplicates an already-processed notificationUUID", async () => {
    (subs.hasStripeEventBeenProcessed as any).mockResolvedValue(true);
    (verifyNotification as any).mockResolvedValue({
      notificationType: "DID_RENEW", notificationUUID: "uuid_1",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly", originalTransactionId: "otx_1", expiresDate: 0
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("unknown type → 200, no write", async () => {
    (verifyNotification as any).mockResolvedValue({
      notificationType: "SOME_FUTURE_TYPE", notificationUUID: "uuid_3",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly", originalTransactionId: "otx_1", expiresDate: 0
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });
});
