import { describe, it, expect } from "vitest";
import { ruleCapWindow } from "@/lib/db/queries/evaluation";
import { pledgeRuleInputSchema } from "@/lib/validations/pledge";

/**
 * Perioden-Cap pro Wette (Migration 0040). Reine Logik-Tests:
 *  - ruleCapWindow liefert das korrekte Fenster (Monat des Spiels / Pledge-Saison).
 *  - Validation: Cap nur bei Spiel-Wetten, capPeriod Pflicht bei capEur.
 */
describe("ruleCapWindow", () => {
  it("month → Kalendermonat des Spieldatums", () => {
    const { start, end } = ruleCapWindow(
      "month",
      new Date("2026-06-14T12:00:00Z"),
      new Date("2025-08-01T00:00:00Z"),
      new Date("2026-06-30T23:59:59Z")
    );
    expect(start.getMonth()).toBe(5); // Juni (0-basiert)
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(6); // 1. Juli, exklusiv
    expect(end.getDate()).toBe(1);
  });

  it("season → Pledge-Laufzeit [startsAt, endsAt] (end exklusiv via +1ms)", () => {
    const startsAt = new Date("2025-08-01T00:00:00Z");
    const endsAt = new Date("2026-06-30T23:59:59Z");
    const { start, end } = ruleCapWindow("season", new Date("2026-06-14T12:00:00Z"), startsAt, endsAt);
    expect(start.getTime()).toBe(startsAt.getTime());
    expect(end.getTime()).toBe(endsAt.getTime() + 1);
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
