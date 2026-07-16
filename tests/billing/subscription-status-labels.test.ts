import { describe, it, expect } from "vitest";
import {
  getSubscriptionStatusInfo,
  type StatusTone
} from "@/lib/billing/subscription-status-labels";

/** Alle Werte des subscription_status-Enums (lib/db/schema/billing.ts). */
const ALL_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "incomplete"
] as const;

describe("getSubscriptionStatusInfo", () => {
  it("übersetzt JEDEN DB-Status in ein deutsches Label — nie der Rohwert", () => {
    for (const status of ALL_STATUSES) {
      const info = getSubscriptionStatusInfo(status);
      expect(info.label).not.toBe(status);
      expect(info.label).not.toMatch(/_/); // kein "past_due" o.ä. durchgereicht
      expect(info.label.length).toBeGreaterThan(0);
    }
  });

  it("erklärt 'incomplete' als offene Zahlung statt als 'Unvollständig'", () => {
    const info = getSubscriptionStatusInfo("incomplete");
    // Der alte Rohtext sagte einem Vereinsvorstand nichts.
    expect(info.label).not.toMatch(/Unvollständig/i);
    expect(info.label).toMatch(/Zahlung/i);
    // Muss sagen, was zu tun ist.
    expect(info.hint).toBeTruthy();
    expect(info.hint).toMatch(/erneut/i);
    expect(info.tone).toBe<StatusTone>("attention");
  });

  it("erklärt 'past_due' inkl. Handlungsaufforderung + Folge", () => {
    const info = getSubscriptionStatusInfo("past_due");
    expect(info.label).toMatch(/Zahlung/i);
    expect(info.hint).toMatch(/Zahlungsdaten/i);
    expect(info.tone).toBe<StatusTone>("attention");
  });

  it("färbt laufende Abos grün, beendete neutral", () => {
    expect(getSubscriptionStatusInfo("active").tone).toBe<StatusTone>("success");
    expect(getSubscriptionStatusInfo("trialing").tone).toBe<StatusTone>(
      "success"
    );
    expect(getSubscriptionStatusInfo("cancelled").tone).toBe<StatusTone>(
      "neutral"
    );
  });

  it("lässt Zustände mit eigenem Datums-Block in der Karte ohne Hint", () => {
    // Trial-Restlaufzeit + Sommerpause-Enddatum stehen schon in der Abo-Karte —
    // ein Hint würde dieselbe Aussage doppeln.
    expect(getSubscriptionStatusInfo("trialing").hint).toBeNull();
    expect(getSubscriptionStatusInfo("paused").hint).toBeNull();
  });

  it("fängt unbekannte/neue Enum-Werte ab, statt sie roh anzuzeigen", () => {
    const info = getSubscriptionStatusInfo("some_future_status");
    expect(info.label).not.toMatch(/some_future_status/);
    expect(info.tone).toBe<StatusTone>("neutral");
  });
});
