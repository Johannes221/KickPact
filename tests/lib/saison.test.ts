import { describe, it, expect } from "vitest";
import { saisonStartDate, saisonEndDateExclusive } from "@/lib/utils/saison";

describe("saisonStartDate", () => {
  it("2526 → 2025-07-01", () => {
    expect(saisonStartDate("2526")?.getFullYear()).toBe(2025);
    expect(saisonStartDate("2526")?.getMonth()).toBe(6); // Juli (0-indexiert)
    expect(saisonStartDate("2526")?.getDate()).toBe(1);
  });
  it("2425 → 2024-07-01", () => {
    expect(saisonStartDate("2425")?.getFullYear()).toBe(2024);
  });
  it("ungültig → null", () => {
    expect(saisonStartDate("foo")).toBeNull();
    expect(saisonStartDate("")).toBeNull();
  });
});

describe("saisonEndDateExclusive", () => {
  it("2526 → 2026-07-01 (exklusiv)", () => {
    expect(saisonEndDateExclusive("2526")?.getFullYear()).toBe(2026);
    expect(saisonEndDateExclusive("2526")?.getMonth()).toBe(6);
  });
});
