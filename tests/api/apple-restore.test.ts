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
  getClubIdByOriginalTransactionId: vi.fn(),
  syncAppleSubscriptionForClub: vi.fn(),
  setTeamLicensesPlanForSubscription: vi.fn()
}));

const { verifyTransaction } = await import("@/lib/apple/verifier");
const { assertClubAccess } = await import("@/lib/auth/scope");
const subs = await import("@/lib/db/queries/subscriptions");
const { POST } = await import("@/app/api/apple/restore/route");

function req(body: unknown) {
  return new Request("https://t.dev/api/apple/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (assertClubAccess as any).mockResolvedValue({ club: { id: "club_1", slug: "x" } });
  (subs.getSubscriptionProvider as any).mockResolvedValue(null);
  (subs.getClubIdByOriginalTransactionId as any).mockResolvedValue(null);
});

describe("POST /api/apple/restore", () => {
  it("rejects when the club already pays via Stripe (channel invariant)", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue("stripe");
    const res = await POST(
      req({ clubSlug: "x", transactions: [{ jwsRepresentation: "jws" }] }) as any
    );
    expect(res.status).toBe(409);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("400 on empty transactions array", async () => {
    const res = await POST(req({ clubSlug: "x", transactions: [] }) as any);
    expect(res.status).toBe(400);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("picks the highest tier among valid transactions (basic + pro → pro)", async () => {
    (verifyTransaction as any)
      .mockResolvedValueOnce({
        productId: "kickpact.basic.monthly",
        originalTransactionId: "otx_basic",
        expiresDate: 1800000000000
      })
      .mockResolvedValueOnce({
        productId: "kickpact.pro.monthly",
        originalTransactionId: "otx_pro",
        expiresDate: 1800000000000
      });
    const res = await POST(
      req({
        clubSlug: "x",
        transactions: [
          { jwsRepresentation: "jws_basic" },
          { jwsRepresentation: "jws_pro" }
        ]
      }) as any
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, plan: "pro" });
    expect(subs.syncAppleSubscriptionForClub).toHaveBeenCalledWith(
      "club_1",
      expect.objectContaining({ originalTransactionId: "otx_pro", status: "active" })
    );
    expect(subs.setTeamLicensesPlanForSubscription).toHaveBeenCalledWith("club_1", "pro");
  });

  it("404 when no valid (known-product) transactions are found", async () => {
    (verifyTransaction as any).mockResolvedValue({
      productId: "com.foo.bar",
      originalTransactionId: "otx_x",
      expiresDate: 0
    });
    const res = await POST(
      req({ clubSlug: "x", transactions: [{ jwsRepresentation: "jws" }] }) as any
    );
    expect(res.status).toBe(404);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("skips transactions that fail verification but uses the valid one", async () => {
    (verifyTransaction as any)
      .mockRejectedValueOnce(new Error("bad sig"))
      .mockResolvedValueOnce({
        productId: "kickpact.basic.monthly",
        originalTransactionId: "otx_basic",
        expiresDate: 1800000000000
      });
    const res = await POST(
      req({
        clubSlug: "x",
        transactions: [
          { jwsRepresentation: "bad" },
          { jwsRepresentation: "good" }
        ]
      }) as any
    );
    expect(res.status).toBe(200);
    expect(subs.setTeamLicensesPlanForSubscription).toHaveBeenCalledWith("club_1", "basic");
  });

  it("409 when the best transaction belongs to another club (replay)", async () => {
    (verifyTransaction as any).mockResolvedValue({
      productId: "kickpact.pro.monthly",
      originalTransactionId: "otx_pro",
      expiresDate: 1800000000000
    });
    (subs.getClubIdByOriginalTransactionId as any).mockResolvedValue("other_club");
    const res = await POST(
      req({ clubSlug: "x", transactions: [{ jwsRepresentation: "jws" }] }) as any
    );
    expect(res.status).toBe(409);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });
});
