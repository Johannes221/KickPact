import { describe, expect, it } from "vitest";
import { nextAugustFirst } from "@/lib/billing/season-pass-dates";

describe("nextAugustFirst", () => {
  it("vor August (z.B. 1.6.2026) → 1.8.2026", () => {
    expect(nextAugustFirst(new Date("2026-06-01T02:00:00Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z"
    );
  });

  it("im Juli → 1.8. desselben Jahres", () => {
    expect(nextAugustFirst(new Date("2026-07-15T12:00:00Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z"
    );
  });

  it("am 1.8. selbst → 1.8. des Folgejahres", () => {
    expect(nextAugustFirst(new Date("2026-08-01T00:00:00Z")).toISOString()).toBe(
      "2027-08-01T00:00:00.000Z"
    );
  });

  it("im September → 1.8. des Folgejahres", () => {
    expect(nextAugustFirst(new Date("2026-09-20T00:00:00Z")).toISOString()).toBe(
      "2027-08-01T00:00:00.000Z"
    );
  });

  it("im Januar → 1.8. desselben Jahres", () => {
    expect(nextAugustFirst(new Date("2027-01-15T00:00:00Z")).toISOString()).toBe(
      "2027-08-01T00:00:00.000Z"
    );
  });
});
