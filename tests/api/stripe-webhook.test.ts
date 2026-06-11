/**
 * Stripe-Webhook: Verlust- und Ordering-Schutz (Audit 2026-06-11 / Phase 2 / A4).
 *
 * Drei Kernaussagen:
 * 1. Der processed-Marker wird erst NACH erfolgreichem Handling persistiert —
 *    schlägt der Handler fehl, bleibt der Event unmarkiert und Stripe kann
 *    retryen (vorher: Marker zuerst → Event bei DB-Hickup für immer verloren).
 * 2. customer.subscription.*-Events nehmen NICHT das Event-Payload als
 *    Wahrheit, sondern fetchen die Subscription frisch von Stripe
 *    (authoritative sync) — reordered Deliveries können keinen alten Stand
 *    über einen neuen schreiben.
 * 3. invoice.paid reaktiviert nur, wenn die frisch gefetchte Subscription
 *    wirklich active/trialing ist (vorher: Rest-Invoice einer gekündigten
 *    Subscription reaktivierte den Club).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  constructEventMock,
  subscriptionsRetrieveMock,
  markProcessedMock,
  hasProcessedMock,
  syncMock,
  setLicPlanMock,
  cancelClubMock,
  setLicStatusMock,
  setStatusByCustomerMock,
  getClubIdByCustomerMock,
  getCustomerIdMock
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  subscriptionsRetrieveMock: vi.fn(),
  markProcessedMock: vi.fn(),
  hasProcessedMock: vi.fn(),
  syncMock: vi.fn(),
  setLicPlanMock: vi.fn(),
  cancelClubMock: vi.fn(),
  setLicStatusMock: vi.fn(),
  setStatusByCustomerMock: vi.fn(),
  getClubIdByCustomerMock: vi.fn(),
  getCustomerIdMock: vi.fn()
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subscriptionsRetrieveMock }
  }),
  getStripeWebhookSecret: () => "whsec_test",
  isStripeConfigured: () => true
}));

vi.mock("@/lib/analytics/track-server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/stripe/pricing", () => ({
  priceIdToPlanCycle: (priceId: string) =>
    priceId === "price_basic_monthly" ? { plan: "basic", cycle: "monthly" } : null
}));

vi.mock("@/lib/db/queries/subscriptions", () => ({
  markStripeEventProcessed: markProcessedMock,
  hasStripeEventBeenProcessed: hasProcessedMock,
  getSubscriptionCustomerId: getCustomerIdMock,
  syncSubscriptionForClub: syncMock,
  setTeamLicensesPlanForSubscription: setLicPlanMock,
  cancelSubscriptionForClub: cancelClubMock,
  setTeamLicensesStatusForClubTeams: setLicStatusMock,
  setSubscriptionStatusByCustomer: setStatusByCustomerMock,
  getClubIdByCustomer: getClubIdByCustomerMock
}));

vi.mock("@/lib/billing/downgrade-enforcement", () => ({
  enforceBasicDowngrade: vi.fn().mockResolvedValue({ pausedPledges: 0, deactivatedRules: 0 })
}));

import { POST } from "@/app/api/stripe/webhook/route";

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}"
  });
}

function subscriptionEvent(
  type: string,
  sub: Record<string, unknown>
): Record<string, unknown> {
  return { id: "evt_1", type, data: { object: sub } };
}

const BASE_SUB = {
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  metadata: { clubId: "club1" },
  items: { data: [{ id: "si_1", price: { id: "price_basic_monthly" }, current_period_end: 1790000000 }] },
  pause_collection: null,
  cancel_at: null,
  trial_end: null
};

beforeEach(() => {
  vi.clearAllMocks();
  // mockRejectedValue aus Fehler-Tests überlebt clearAllMocks → explizit zurücksetzen.
  syncMock.mockReset().mockResolvedValue(undefined);
  hasProcessedMock.mockResolvedValue(false);
  markProcessedMock.mockResolvedValue(true);
  getCustomerIdMock.mockResolvedValue({ customerId: "cus_1" });
  subscriptionsRetrieveMock.mockResolvedValue(BASE_SUB);
  getClubIdByCustomerMock.mockResolvedValue("club1");
});

describe("stripe webhook — Marker-Lebenszyklus (A4)", () => {
  it("persistiert den Marker erst NACH erfolgreichem Handling", async () => {
    constructEventMock.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", BASE_SUB)
    );

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(markProcessedMock).toHaveBeenCalledWith("evt_1", "customer.subscription.updated");
    // Marker NACH dem Handler: sync wurde vor markProcessed aufgerufen.
    const syncOrder = syncMock.mock.invocationCallOrder[0];
    const markOrder = markProcessedMock.mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(markOrder);
  });

  it("Handler-Fehler ⇒ kein Marker + 500 (Stripe-Retry möglich)", async () => {
    constructEventMock.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", BASE_SUB)
    );
    syncMock.mockRejectedValue(new Error("db down"));

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    expect(markProcessedMock).not.toHaveBeenCalled();
  });

  it("bereits verarbeiteter Event ⇒ dedupliziert, keine Handler-Calls", async () => {
    constructEventMock.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", BASE_SUB)
    );
    hasProcessedMock.mockResolvedValue(true);

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(syncMock).not.toHaveBeenCalled();
    expect(markProcessedMock).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — authoritative Re-Fetch (A4)", () => {
  it("stale subscription.updated überschreibt nicht: frischer Stripe-Stand gewinnt", async () => {
    // Event-Payload behauptet "canceled" (alte, reordered Delivery) —
    // der frische Fetch sagt active.
    constructEventMock.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", {
        ...BASE_SUB,
        status: "canceled"
      })
    );
    subscriptionsRetrieveMock.mockResolvedValue({ ...BASE_SUB, status: "active" });

    await POST(makeReq());

    expect(subscriptionsRetrieveMock).toHaveBeenCalledWith("sub_1");
    expect(syncMock).toHaveBeenCalledWith(
      "club1",
      expect.objectContaining({ status: "active" })
    );
  });
});

describe("stripe webhook — Basic-Downgrade-Enforcement (A7)", () => {
  it("Plan-Sync auf basic ruft enforceBasicDowngrade auf", async () => {
    const { enforceBasicDowngrade } = await import("@/lib/billing/downgrade-enforcement");
    constructEventMock.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", BASE_SUB)
    );

    await POST(makeReq());

    expect(setLicPlanMock).toHaveBeenCalledWith("club1", "basic");
    expect(enforceBasicDowngrade).toHaveBeenCalledWith("club1");
  });

  it("unbekannter Price (kein planCycle) → kein Enforcement", async () => {
    const { enforceBasicDowngrade } = await import("@/lib/billing/downgrade-enforcement");
    const sub = {
      ...BASE_SUB,
      items: { data: [{ id: "si_1", price: { id: "price_unknown" } }] }
    };
    constructEventMock.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", sub)
    );
    subscriptionsRetrieveMock.mockResolvedValue(sub);

    await POST(makeReq());

    expect(enforceBasicDowngrade).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — invoice.paid Guard (A4)", () => {
  function invoicePaidEvent(subId: string | null): Record<string, unknown> {
    return {
      id: "evt_inv",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          ...(subId
            ? { parent: { subscription_details: { subscription: subId } } }
            : {})
        }
      }
    };
  }

  it("reaktiviert NICHT, wenn die frische Subscription gekündigt ist", async () => {
    constructEventMock.mockReturnValue(invoicePaidEvent("sub_1"));
    subscriptionsRetrieveMock.mockResolvedValue({ ...BASE_SUB, status: "canceled" });

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(setStatusByCustomerMock).not.toHaveBeenCalled();
    expect(setLicStatusMock).not.toHaveBeenCalled();
    // Event gilt trotzdem als verarbeitet (kein Endlos-Retry).
    expect(markProcessedMock).toHaveBeenCalled();
  });

  it("reaktiviert, wenn die frische Subscription active ist", async () => {
    constructEventMock.mockReturnValue(invoicePaidEvent("sub_1"));
    subscriptionsRetrieveMock.mockResolvedValue({ ...BASE_SUB, status: "active" });

    await POST(makeReq());

    expect(setStatusByCustomerMock).toHaveBeenCalledWith("cus_1", "active");
    expect(setLicStatusMock).toHaveBeenCalledWith("club1", "active");
  });

  it("Invoice ohne Subscription-Bezug ⇒ keine Reaktivierung", async () => {
    constructEventMock.mockReturnValue(invoicePaidEvent(null));

    await POST(makeReq());

    expect(setStatusByCustomerMock).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — invoice.payment_failed authoritative (Review-Befund)", () => {
  function paymentFailedEvent(subId: string | null): Record<string, unknown> {
    return {
      id: "evt_pf",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_pf",
          customer: "cus_1",
          ...(subId
            ? { parent: { subscription_details: { subscription: subId } } }
            : {})
        }
      }
    };
  }

  it("frische Subscription past_due → Status past_due", async () => {
    constructEventMock.mockReturnValue(paymentFailedEvent("sub_1"));
    subscriptionsRetrieveMock.mockResolvedValue({ ...BASE_SUB, status: "past_due" });

    await POST(makeReq());

    expect(setStatusByCustomerMock).toHaveBeenCalledWith("cus_1", "past_due");
  });

  it("stale payment_failed nach Kündigung → cancelled bleibt cancelled (kein Grace-Fenster)", async () => {
    constructEventMock.mockReturnValue(paymentFailedEvent("sub_1"));
    subscriptionsRetrieveMock.mockResolvedValue({ ...BASE_SUB, status: "canceled" });

    await POST(makeReq());

    expect(setStatusByCustomerMock).toHaveBeenCalledWith("cus_1", "cancelled");
    expect(setStatusByCustomerMock).not.toHaveBeenCalledWith("cus_1", "past_due");
  });

  it("payment_failed ohne Subscription-Bezug → kein Status-Write", async () => {
    constructEventMock.mockReturnValue(paymentFailedEvent(null));

    await POST(makeReq());

    expect(setStatusByCustomerMock).not.toHaveBeenCalled();
  });
});
