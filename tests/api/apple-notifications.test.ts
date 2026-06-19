import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/apple/verifier", () => ({
  isAppleIapConfigured: () => true,
  verifyNotification: vi.fn(),
  verifyTransaction: vi.fn()
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  hasStripeEventBeenProcessed: vi.fn(),
  markStripeEventProcessed: vi.fn(),
  getClubIdByOriginalTransactionId: vi.fn(),
  getAppleExpiresAt: vi.fn(),
  syncAppleSubscriptionForClub: vi.fn(),
  setTeamLicensesPlanForSubscription: vi.fn(),
  setTeamLicensesStatusForClubTeams: vi.fn()
}));

const { verifyNotification, verifyTransaction } = await import("@/lib/apple/verifier");
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
  (subs.getAppleExpiresAt as any).mockResolvedValue(null);
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

  // --- MEDIUM-1: Reorder-Guard (monotone expiresDate) ---

  it("verwirft eine reordered ältere EXPIRED-Notification (stale), markiert aber processed", async () => {
    (subs.getAppleExpiresAt as any).mockResolvedValue(new Date(2_000_000_000_000));
    (verifyNotification as any).mockResolvedValue({
      notificationType: "EXPIRED",
      notificationUUID: "uuid_stale",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly",
        originalTransactionId: "otx_1",
        expiresDate: 1_000_000_000_000
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
    expect(subs.markStripeEventProcessed).toHaveBeenCalledWith("uuid_stale", "EXPIRED");
  });

  // --- MEDIUM-3: zweiter JWS-Decode (String-Pfad) ---

  it("decodiert signedTransactionInfo als STRING via verifyTransaction und schreibt aktiv", async () => {
    (verifyTransaction as any).mockResolvedValue({
      productId: "kickpact.pro.monthly",
      originalTransactionId: "otx_1",
      expiresDate: 1800000000000
    });
    (verifyNotification as any).mockResolvedValue({
      notificationType: "DID_RENEW",
      notificationUUID: "uuid_str",
      data: { signedTransactionInfo: "signed-jws-string" }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(verifyTransaction).toHaveBeenCalledWith("signed-jws-string");
    expect(subs.syncAppleSubscriptionForClub).toHaveBeenCalledWith("club_1",
      expect.objectContaining({ status: "active", originalTransactionId: "otx_1" }));
  });

  it("ein fehlschlagender String-Decode (verifyTransaction wirft) schreibt KEINE Entitlement", async () => {
    (verifyTransaction as any).mockRejectedValue(new Error("bad transaction jws"));
    (verifyNotification as any).mockResolvedValue({
      notificationType: "DID_RENEW",
      notificationUUID: "uuid_str_fail",
      data: { signedTransactionInfo: "signed-jws-string" }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    // Der Decode-Throw blubbert in den äußeren catch → 500, aber KEIN Write.
    expect(res.status).toBe(500);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });
});
