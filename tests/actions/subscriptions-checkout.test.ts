import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted() — Mock-Variablen werden vor allen Imports verfügbar.
const {
  stripeCustomersCreate,
  stripeCheckoutSessionsCreate,
  dbSelectFn,
  dbUpdateFn,
  dbInsertFn
} = vi.hoisted(() => ({
  stripeCustomersCreate: vi.fn(),
  stripeCheckoutSessionsCreate: vi.fn(),
  dbSelectFn: vi.fn(),
  dbUpdateFn: vi.fn(),
  dbInsertFn: vi.fn()
}));

vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn().mockResolvedValue({
    user: { id: "u1", email: "admin@verein.de" },
    club: { id: "club1", slug: "fc-test", name: "FC Test" },
    role: "admin"
  })
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u1", email: "admin@verein.de" })
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    customers: { create: stripeCustomersCreate },
    checkout: { sessions: { create: stripeCheckoutSessionsCreate } }
  }),
  isStripeConfigured: () => true
}));

vi.mock("@/lib/stripe/pricing", () => ({
  getStripePriceId: (plan: string, cycle: string = "monthly") =>
    `price_${plan}_${cycle}_test`,
  TRIAL_DAYS: 30
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => dbSelectFn() })
      })
    }),
    update: () => ({
      set: () => ({ where: () => dbUpdateFn() })
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => dbInsertFn() })
    })
  }
}));

import { createCheckoutSession } from "@/lib/actions/subscriptions";

beforeEach(() => {
  stripeCustomersCreate.mockReset();
  stripeCheckoutSessionsCreate.mockReset();
  dbSelectFn.mockReset();
  dbUpdateFn.mockReset();
  dbInsertFn.mockReset();
  stripeCheckoutSessionsCreate.mockResolvedValue({ url: "https://stripe/checkout/test" });
});

describe("createCheckoutSession", () => {
  it("erzeugt einen Stripe-Customer wenn subscription.stripeCustomerId NULL ist", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: null, status: "trialing" }
    ]);
    stripeCustomersCreate.mockResolvedValue({ id: "cus_real_123" });

    const { url } = await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeCustomersCreate).toHaveBeenCalledOnce();
    expect(dbUpdateFn).toHaveBeenCalledOnce();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_real_123" })
    );
    expect(url).toBe("https://stripe/checkout/test");
  });

  it("erzeugt einen Customer wenn stripeCustomerId noch ein legacy 'placeholder_…' ist", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "placeholder_club1", status: "trialing" }
    ]);
    stripeCustomersCreate.mockResolvedValue({ id: "cus_real_456" });

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeCustomersCreate).toHaveBeenCalledOnce();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_real_456" })
    );
  });

  it("reuse den existierenden Customer wenn stripeCustomerId schon real ist", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_existing_789", status: "active" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeCustomersCreate).not.toHaveBeenCalled();
    expect(dbUpdateFn).not.toHaveBeenCalled();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing_789" })
    );
  });

  it("propagates billing cycle from opts to Stripe price-id (Audit #2)", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_x", status: "trialing", billingCycle: "monthly" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "pro", cycle: "season" });

    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_pro_season_test", quantity: 1 }]
      })
    );
  });

  it("falls back to subscription.billingCycle when opts.cycle is missing (Audit #2)", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_y", status: "trialing", billingCycle: "annual" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "verein" });

    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_verein_annual_test", quantity: 1 }]
      })
    );
  });
});
