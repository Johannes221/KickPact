import { describe, it, expect } from "vitest";
import {
  ruleCapWindow,
  utcMonthWindow,
  CAP_COUNTED_STATUSES
} from "@/lib/db/queries/evaluation";
import { pledgeRuleInputSchema } from "@/lib/validations/pledge";

/**
 * Perioden-Cap pro Wette (Migration 0040). Reine Logik-Tests:
 *  - ruleCapWindow liefert das korrekte Fenster (Monat des Spiels / Pledge-Saison).
 *  - Validation: Cap nur bei Spiel-Wetten, capPeriod Pflicht bei capEur.
 */
describe("ruleCapWindow", () => {
  it("month → UTC-Kalendermonat des Anker-Datums", () => {
    const { start, end } = ruleCapWindow(
      "month",
      new Date("2026-06-14T12:00:00Z"),
      new Date("2025-08-01T00:00:00Z"),
      new Date("2026-06-30T23:59:59Z")
    );
    // UTC-Anker (identisch zur Rechnungs-Periode + zur Cap-Anzeige), damit die
    // Monatsfenster nicht bei Server-TZ≠UTC an den Rändern auseinanderdriften.
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("season → Pledge-Laufzeit [startsAt, endsAt] (end exklusiv via +1ms)", () => {
    const startsAt = new Date("2025-08-01T00:00:00Z");
    const endsAt = new Date("2026-06-30T23:59:59Z");
    const { start, end } = ruleCapWindow("season", new Date("2026-06-14T12:00:00Z"), startsAt, endsAt);
    expect(start.getTime()).toBe(startsAt.getTime());
    expect(end.getTime()).toBe(endsAt.getTime() + 1);
  });
});

/**
 * Gemeinsame Cap-Fenster-/Status-Definition (Divergenz-Fix): Enforcement UND
 * Anzeige müssen exakt dieselbe TZ, denselben Datums-Anker und dasselbe
 * Status-Set nutzen. utcMonthWindow lockt die TZ-Achse.
 */
describe("utcMonthWindow", () => {
  it("liefert das UTC-Monatsfenster [start, end) — unabhängig von der Server-TZ", () => {
    // Anker kurz nach Mitternacht UTC: bei server-lokalem new Date(y,m,1) würde
    // das Fenster auf einem Server westlich von UTC in den Vormonat rutschen.
    const { start, end } = utcMonthWindow(new Date("2026-03-01T00:30:00Z"));
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("Jahreswechsel: Dezember-Anker → [1.12., 1.1. Folgejahr)", () => {
    const { start, end } = utcMonthWindow(new Date("2026-12-14T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("CAP_COUNTED_STATUSES", () => {
  it("zählt confirmed, pending_approval und invoiced (pending reserviert Headroom)", () => {
    expect([...CAP_COUNTED_STATUSES].sort()).toEqual([
      "confirmed",
      "invoiced",
      "pending_approval"
    ]);
  });
});

describe("pledgeRuleInputSchema — Cap-Regeln", () => {
  it("lehnt einen Cap auf einer Saison-Wette ab", () => {
    const r = pledgeRuleInputSchema.safeParse({
      triggerType: "season_promotion",
      amountEur: 100,
      capEur: 50,
      capPeriod: "season",
      params: {}
    });
    expect(r.success).toBe(false);
  });

  it("verlangt capPeriod, wenn capEur gesetzt ist", () => {
    const r = pledgeRuleInputSchema.safeParse({
      triggerType: "goal_total",
      amountEur: 5,
      capEur: 50,
      params: {}
    });
    expect(r.success).toBe(false);
  });

  it("akzeptiert einen Monats-Cap auf einer Spiel-Wette", () => {
    const r = pledgeRuleInputSchema.safeParse({
      triggerType: "goal_total",
      amountEur: 5,
      capEur: 50,
      capPeriod: "month",
      params: {}
    });
    expect(r.success).toBe(true);
  });

  it("akzeptiert eine Spiel-Wette ganz ohne Cap", () => {
    const r = pledgeRuleInputSchema.safeParse({
      triggerType: "win",
      amountEur: 10,
      params: {}
    });
    expect(r.success).toBe(true);
  });
});
