import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({})
}));
vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn().mockResolvedValue({ club: { id: "club_1", slug: "x", name: "X" } })
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ email: "a@b.de" })
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  getSubscriptionProvider: vi.fn()
}));

const subs = await import("@/lib/db/queries/subscriptions");
const { createCheckoutSession } = await import("@/lib/actions/subscriptions");

beforeEach(() => vi.clearAllMocks());

describe("createCheckoutSession channel invariant", () => {
  it("refuses to start Stripe checkout when provider=apple", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue("apple");
    await expect(
      createCheckoutSession({ clubSlug: "x", plan: "pro", cycle: "monthly" })
    ).rejects.toThrow(/App/i);
  });
});
