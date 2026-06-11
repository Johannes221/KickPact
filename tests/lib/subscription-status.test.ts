import { describe, expect, it } from "vitest";
import {
  gateFromSubscription,
  isCrawlBlockedByGate,
  isChargeBlockedByGate,
  GRACE_PERIOD_DAYS,
  type SubscriptionRowForGate
} from "@/lib/db/queries/subscription-status";

const NOW = new Date("2026-05-20T12:00:00Z");

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
}

function row(overrides: Partial<SubscriptionRowForGate>): SubscriptionRowForGate {
  return {
    status: "active",
    trialEndsAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

describe("gateFromSubscription", () => {
  it("liefert 'missing' wenn kein Eintrag existiert", () => {
    const gate = gateFromSubscription(null, NOW);
    expect(gate.status).toBe("missing");
    expect(gate.isReadOnly).toBe(false);
    expect(gate.daysUntilReadOnly).toBeNull();
  });

  it("active → kein read-only", () => {
    const gate = gateFromSubscription(row({ status: "active" }), NOW);
    expect(gate.status).toBe("active");
    expect(gate.isReadOnly).toBe(false);
  });

  it("trialing → kein read-only, trialEndsAt durchgereicht", () => {
    const trialEnd = new Date("2026-06-20T12:00:00Z");
    const gate = gateFromSubscription(
      row({ status: "trialing", trialEndsAt: trialEnd }),
      NOW
    );
    expect(gate.status).toBe("trialing");
    expect(gate.isReadOnly).toBe(false);
    expect(gate.trialEndsAt).toEqual(trialEnd);
  });

  it("past_due innerhalb Grace → noch kein read-only", () => {
    const gate = gateFromSubscription(
      row({ status: "past_due", updatedAt: daysAgo(3) }),
      NOW
    );
    expect(gate.status).toBe("past_due");
    expect(gate.isReadOnly).toBe(false);
    expect(gate.daysUntilReadOnly).toBe(GRACE_PERIOD_DAYS - 3);
  });

  it("past_due genau am Grace-Boundary (7d) → noch kein read-only", () => {
    const gate = gateFromSubscription(
      row({ status: "past_due", updatedAt: daysAgo(GRACE_PERIOD_DAYS) }),
      NOW
    );
    expect(gate.isReadOnly).toBe(false);
    expect(gate.daysUntilReadOnly).toBe(0);
  });

  it("past_due jenseits Grace → read-only", () => {
    const gate = gateFromSubscription(
      row({ status: "past_due", updatedAt: daysAgo(GRACE_PERIOD_DAYS + 1) }),
      NOW
    );
    expect(gate.status).toBe("past_due");
    expect(gate.isReadOnly).toBe(true);
    expect(gate.daysUntilReadOnly).toBeNull();
  });

  it("past_due viel später → read-only", () => {
    const gate = gateFromSubscription(
      row({ status: "past_due", updatedAt: daysAgo(30) }),
      NOW
    );
    expect(gate.isReadOnly).toBe(true);
  });

  it("cancelled → sofort read-only", () => {
    const gate = gateFromSubscription(row({ status: "cancelled" }), NOW);
    expect(gate.status).toBe("cancelled");
    expect(gate.isReadOnly).toBe(true);
    expect(gate.daysUntilReadOnly).toBeNull();
  });

  it("incomplete → read-only", () => {
    const gate = gateFromSubscription(row({ status: "incomplete" }), NOW);
    expect(gate.status).toBe("incomplete");
    expect(gate.isReadOnly).toBe(true);
  });

  it("past_due ohne updatedAt fällt auf createdAt zurück", () => {
    const gate = gateFromSubscription(
      {
        status: "past_due",
        trialEndsAt: null,
        createdAt: daysAgo(GRACE_PERIOD_DAYS + 2),
        updatedAt: null
      },
      NOW
    );
    expect(gate.isReadOnly).toBe(true);
  });

  it("pastDueSince ist gesetzt für past_due", () => {
    const updated = daysAgo(2);
    const gate = gateFromSubscription(
      row({ status: "past_due", updatedAt: updated }),
      NOW
    );
    expect(gate.pastDueSince).toEqual(updated);
  });

  // --- Audit 2026-06-11 / Phase 2 / A5: deterministischer past_due-Anker ---

  it("expliziter pastDueSince-Anker gewinnt über updatedAt (Webhook-Sync resettet Grace nicht)", () => {
    // updatedAt wurde gerade durch einen Webhook-Sync gebumpt — der Anker
    // liegt aber 10 Tage zurück → read-only, kein Grace-Reset.
    const gate = gateFromSubscription(
      row({
        status: "past_due",
        updatedAt: NOW,
        pastDueSince: daysAgo(GRACE_PERIOD_DAYS + 3)
      }),
      NOW
    );
    expect(gate.isReadOnly).toBe(true);
    expect(gate.pastDueSince).toEqual(daysAgo(GRACE_PERIOD_DAYS + 3));
  });

  it("pastDueSince innerhalb Grace → noch kein read-only, korrektes Restfenster", () => {
    const gate = gateFromSubscription(
      row({ status: "past_due", updatedAt: NOW, pastDueSince: daysAgo(3) }),
      NOW
    );
    expect(gate.isReadOnly).toBe(false);
    expect(gate.daysUntilReadOnly).toBe(GRACE_PERIOD_DAYS - 3);
  });

  // --- Phase 3 / R6: trial_expired-Reason (abgelaufener, nie bezahlter Trial) ---

  it("cancelled ohne stripeSubscriptionId → reason trial_expired (Trial nie bezahlt)", () => {
    const gate = gateFromSubscription(
      row({ status: "cancelled", stripeSubscriptionId: null, trialEndsAt: daysAgo(5) }),
      NOW
    );
    expect(gate.status).toBe("cancelled");
    expect(gate.isReadOnly).toBe(true);
    expect(gate.reason).toBe("trial_expired");
  });

  it("cancelled MIT stripeSubscriptionId → reason null (echte Kündigung)", () => {
    const gate = gateFromSubscription(
      row({ status: "cancelled", stripeSubscriptionId: "sub_123" }),
      NOW
    );
    expect(gate.reason).toBeNull();
  });

  it("trialing mit abgelaufenem trialEndsAt + nie bezahlt → reason trial_expired, aber nicht read-only", () => {
    // Fenster zwischen Trial-Ablauf und dem täglichen expire-trials-Cron:
    // Status steht noch auf trialing, lizenziert ist der Verein nicht mehr.
    const gate = gateFromSubscription(
      row({
        status: "trialing",
        trialEndsAt: daysAgo(1),
        stripeSubscriptionId: null
      }),
      NOW
    );
    expect(gate.isReadOnly).toBe(false);
    expect(gate.reason).toBe("trial_expired");
  });

  it("trialing mit laufendem Trial → reason null", () => {
    const gate = gateFromSubscription(
      row({
        status: "trialing",
        trialEndsAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        stripeSubscriptionId: null
      }),
      NOW
    );
    expect(gate.reason).toBeNull();
  });

  it("active → reason null", () => {
    const gate = gateFromSubscription(row({ status: "active" }), NOW);
    expect(gate.reason).toBeNull();
  });
});

describe("isCrawlBlockedByGate / isChargeBlockedByGate", () => {
  const trialExpiredGate = gateFromSubscription(
    row({ status: "cancelled", stripeSubscriptionId: null, trialEndsAt: daysAgo(5) }),
    NOW
  );
  const cancelledGate = gateFromSubscription(
    row({ status: "cancelled", stripeSubscriptionId: "sub_x" }),
    NOW
  );
  const pausedGate = gateFromSubscription(row({ status: "paused" }), NOW);
  const activeGate = gateFromSubscription(row({ status: "active" }), NOW);
  const pastDueGate = gateFromSubscription(
    row({ status: "past_due", pastDueSince: daysAgo(GRACE_PERIOD_DAYS + 3) }),
    NOW
  );
  const expiredTrialingGate = gateFromSubscription(
    row({ status: "trialing", trialEndsAt: daysAgo(1), stripeSubscriptionId: null }),
    NOW
  );

  it("Crawling: nur echt-cancelled wird geskippt — trial_expired/paused/past_due laufen weiter", () => {
    expect(isCrawlBlockedByGate(cancelledGate)).toBe(true);
    expect(isCrawlBlockedByGate(trialExpiredGate)).toBe(false);
    expect(isCrawlBlockedByGate(pausedGate)).toBe(false);
    expect(isCrawlBlockedByGate(pastDueGate)).toBe(false);
    expect(isCrawlBlockedByGate(activeGate)).toBe(false);
    expect(isCrawlBlockedByGate(expiredTrialingGate)).toBe(false);
  });

  it("Charges: past_due/cancelled UND abgelaufener Trial blocken, paused/active nicht", () => {
    expect(isChargeBlockedByGate(cancelledGate)).toBe(true);
    expect(isChargeBlockedByGate(trialExpiredGate)).toBe(true);
    expect(isChargeBlockedByGate(pastDueGate)).toBe(true);
    expect(isChargeBlockedByGate(expiredTrialingGate)).toBe(true);
    expect(isChargeBlockedByGate(pausedGate)).toBe(false);
    expect(isChargeBlockedByGate(activeGate)).toBe(false);
  });
});
