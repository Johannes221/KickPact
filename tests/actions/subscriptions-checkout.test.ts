import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted() — Mock-Variablen werden vor allen Imports verfügbar.
const {
  stripeCustomersCreate,
  stripeCheckoutSessionsCreate,
  stripeSubscriptionsRetrieve,
  stripeSubscriptionsUpdate,
  dbSelectFn,
  dbUpdateFn,
  dbInsertFn
} = vi.hoisted(() => ({
  stripeCustomersCreate: vi.fn(),
  stripeCheckoutSessionsCreate: vi.fn(),
  stripeSubscriptionsRetrieve: vi.fn(),
  stripeSubscriptionsUpdate: vi.fn(),
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
    checkout: { sessions: { create: stripeCheckoutSessionsCreate } },
    subscriptions: {
      retrieve: stripeSubscriptionsRetrieve,
      update: stripeSubscriptionsUpdate
    }
  }),
  isStripeConfigured: () => true
}));

vi.mock("@/lib/stripe/pricing", () => ({
  getStripePriceId: (plan: string, cycle: string = "monthly") =>
    `price_${plan}_${cycle}_test`,
  normalizeBillingCycle: (raw: string | null | undefined) =>
    raw === "monthly" || raw === "season_end" ? raw : "monthly",
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
  stripeSubscriptionsRetrieve.mockReset();
  stripeSubscriptionsUpdate.mockReset();
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
      expect.objectContaining({ customer: "cus_real_123" }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
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
      expect.objectContaining({ customer: "cus_real_456" }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
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
      expect.objectContaining({ customer: "cus_existing_789" }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it("propagates billing cycle from opts to Stripe price-id (Audit #2)", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_x", status: "trialing", billingCycle: "monthly" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "pro", cycle: "season_end" });

    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_pro_season_end_test", quantity: 1 }]
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it("falls back to subscription.billingCycle when opts.cycle is missing (Audit #2)", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_y", status: "trialing", billingCycle: "season_end" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "verein" });

    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_verein_season_end_test", quantity: 1 }]
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  // --- Audit 2026-06-11 / Phase 2 / A2: Dynamic Payment Methods ---

  it("sendet KEINE payment_method_types (Dynamic Payment Methods, A2)", async () => {
    dbSelectFn.mockResolvedValue([
      { clubId: "club1", stripeCustomerId: "cus_x", status: "trialing" }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    const arg = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(arg).not.toHaveProperty("payment_method_types");
  });

  // --- Audit 2026-06-11 / Phase 2 / A3: trial_end statt trial_period_days ---

  it("gibt Rest-Trial via trial_end weiter (kein trial_period_days-Reset)", async () => {
    const trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    dbSelectFn.mockResolvedValue([
      {
        clubId: "club1",
        stripeCustomerId: "cus_x",
        status: "trialing",
        stripeSubscriptionId: null,
        trialEndsAt
      }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    const arg = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_end).toBe(
      Math.floor(trialEndsAt.getTime() / 1000)
    );
    expect(arg.subscription_data).not.toHaveProperty("trial_period_days");
  });

  it("abgelaufener Trial → kein Trial-Param im Checkout", async () => {
    dbSelectFn.mockResolvedValue([
      {
        clubId: "club1",
        stripeCustomerId: "cus_x",
        status: "trialing",
        stripeSubscriptionId: null,
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    const arg = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(arg.subscription_data).not.toHaveProperty("trial_end");
    expect(arg.subscription_data).not.toHaveProperty("trial_period_days");
  });

  it("Rest-Trial unter 48h → kein Trial-Param (Stripe-Checkout-Minimum)", async () => {
    dbSelectFn.mockResolvedValue([
      {
        clubId: "club1",
        stripeCustomerId: "cus_x",
        status: "trialing",
        stripeSubscriptionId: null,
        trialEndsAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
      }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    const arg = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(arg.subscription_data).not.toHaveProperty("trial_end");
  });

  it("trialEndsAt=null → kein Trial-Param", async () => {
    dbSelectFn.mockResolvedValue([
      {
        clubId: "club1",
        stripeCustomerId: "cus_x",
        status: "trialing",
        stripeSubscriptionId: null,
        trialEndsAt: null
      }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    const arg = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(arg.subscription_data).not.toHaveProperty("trial_end");
  });

  // --- Audit 2026-06-11 / Phase 2 / A1: Plan-Wechsel ohne Doppel-Checkout ---

  it("aktives Abo + Plan-Wechsel → subscriptions.update statt Checkout (A1)", async () => {
    dbSelectFn.mockResolvedValue([
      {
        clubId: "club1",
        stripeCustomerId: "cus_x",
        stripeSubscriptionId: "sub_existing_1",
        status: "active",
        billingCycle: "monthly"
      }
    ]);
    stripeSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_existing_1",
      items: { data: [{ id: "si_item_1", price: { id: "price_basic_monthly_test" } }] }
    });
    stripeSubscriptionsUpdate.mockResolvedValue({ id: "sub_existing_1" });

    const { url } = await createCheckoutSession({ clubSlug: "fc-test", plan: "pro" });

    expect(stripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    expect(stripeSubscriptionsRetrieve).toHaveBeenCalledWith("sub_existing_1");
    expect(stripeSubscriptionsUpdate).toHaveBeenCalledWith(
      "sub_existing_1",
      expect.objectContaining({
        items: [{ id: "si_item_1", price: "price_pro_monthly_test" }],
        proration_behavior: "create_prorations"
      }),
      {
        idempotencyKey:
          "sub-update-sub_existing_1-price_basic_monthly_test-price_pro_monthly_test"
      }
    );
    expect(url).toContain("/verein/fc-test");
  });

  it("gekündigtes Abo mit alter stripeSubscriptionId → normales Checkout (A1)", async () => {
    dbSelectFn.mockResolvedValue([
      {
        clubId: "club1",
        stripeCustomerId: "cus_x",
        stripeSubscriptionId: "sub_old_cancelled",
        status: "cancelled",
        billingCycle: "monthly"
      }
    ]);

    await createCheckoutSession({ clubSlug: "fc-test", plan: "basic" });

    expect(stripeSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledOnce();
  });
});
