import { describe, expect, it } from "vitest";
import {
  gateFromSubscription,
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
});
