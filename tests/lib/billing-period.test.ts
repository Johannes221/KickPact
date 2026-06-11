/**
 * Halb-offene Abrechnungsperioden (Audit 2026-06-11 / Phase 2 / B8).
 *
 * `[monthStart, nextMonthStart)` statt `[monthStart, lastDay 23:59:59]` —
 * das alte Intervall hatte ein 1-Sekunden-Loch: eine Charge mit
 * confirmedAt 23:59:59.500 fiel in KEINE Periode und wurde nie fakturiert.
 * UTC-Anker bleibt (dokumentierte Vereinfachung).
 */
import { describe, expect, it } from "vitest";
import { billingPeriodFromString, lastBillingPeriod } from "@/lib/invoicing/period";

describe("billingPeriodFromString (B8)", () => {
  it("endsAt = Beginn des Folgemonats (exklusiv), kein 1s-Loch", () => {
    const p = billingPeriodFromString("2026-05");
    expect(p.startsAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.endsAt.toISOString()).toBe("2026-06-01T00:00:00.000Z");

    // Eine Charge um 23:59:59.500 liegt INNERHALB der Periode.
    const lateCharge = new Date("2026-05-31T23:59:59.500Z");
    expect(lateCharge.getTime()).toBeGreaterThanOrEqual(p.startsAt.getTime());
    expect(lateCharge.getTime()).toBeLessThan(p.endsAt.getTime());
  });

  it("Jahreswechsel: Dezember endet am 1.1. des Folgejahres", () => {
    const p = billingPeriodFromString("2025-12");
    expect(p.endsAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("lastBillingPeriod (B8)", () => {
  it("im Juni → Mai-Periode mit exklusivem 1.6.-Ende", () => {
    const p = lastBillingPeriod(new Date("2026-06-01T03:17:00Z"));
    expect(p.year).toBe(2026);
    expect(p.month).toBe(5);
    expect(p.startsAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.endsAt.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("im Januar → Dezember-Periode des Vorjahres", () => {
    const p = lastBillingPeriod(new Date("2026-01-01T03:17:00Z"));
    expect(p.year).toBe(2025);
    expect(p.month).toBe(12);
    expect(p.endsAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
