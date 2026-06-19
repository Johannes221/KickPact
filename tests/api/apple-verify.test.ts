import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/apple/verifier", () => ({
  isAppleIapConfigured: () => true,
  verifyTransaction: vi.fn()
}));
vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn()
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  getSubscriptionProvider: vi.fn(),
  syncAppleSubscriptionForClub: vi.fn(),
  setTeamLicensesPlanForSubscription: vi.fn()
}));

const { verifyTransaction } = await import("@/lib/apple/verifier");
const { assertClubAccess } = await import("@/lib/auth/scope");
const subs = await import("@/lib/db/queries/subscriptions");
const { POST } = await import("@/app/api/apple/verify/route");

function req(body: unknown) {
  return new Request("https://t.dev/api/apple/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (assertClubAccess as any).mockResolvedValue({ club: { id: "club_1", slug: "x" } });
  (verifyTransaction as any).mockResolvedValue({
    productId: "kickpact.pro.season",
    originalTransactionId: "otx_1",
    expiresDate: 1800000000000
  });
});

describe("POST /api/apple/verify", () => {
  it("rejects when the club already pays via Stripe (channel invariant)", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue("stripe");
    const res = await POST(req({ clubSlug: "x", signedTransaction: "jws" }) as any);
    expect(res.status).toBe(409);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("writes the entitlement on a clean apple purchase", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue(null);
    const res = await POST(req({ clubSlug: "x", signedTransaction: "jws" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).toHaveBeenCalledWith("club_1",
      expect.objectContaining({ originalTransactionId: "otx_1", status: "active" }));
    expect(subs.setTeamLicensesPlanForSubscription).toHaveBeenCalledWith("club_1", "pro");
  });

  it("rejects an unparseable / unknown product", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue(null);
    (verifyTransaction as any).mockResolvedValue({
      productId: "com.foo.bar", originalTransactionId: "otx_2", expiresDate: 0
    });
    const res = await POST(req({ clubSlug: "x", signedTransaction: "jws" }) as any);
    expect(res.status).toBe(400);
  });
});
