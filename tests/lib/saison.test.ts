import { describe, it, expect } from "vitest";
import {
  saisonStartDate,
  currentSaisonCode,
  nextSaisonCode,
  prevSaisonCode,
  saisonLabel
} from "@/lib/utils/saison";

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

describe("currentSaisonCode", () => {
  it("Juni 2026 → noch Saison 25/26", () => {
    expect(currentSaisonCode(new Date(2026, 5, 30))).toBe("2526");
  });
  it("1. Juli 2026 → neue Saison 26/27 (ab Juli neues Saisonjahr)", () => {
    expect(currentSaisonCode(new Date(2026, 6, 1))).toBe("2627");
  });
  it("September 2026 → 2627", () => {
    expect(currentSaisonCode(new Date(2026, 8, 15))).toBe("2627");
  });
  it("Mai 2026 → 2526", () => {
    expect(currentSaisonCode(new Date(2026, 4, 1))).toBe("2526");
  });
  it("Januar 2027 → 2627 (zweite Saisonhälfte)", () => {
    expect(currentSaisonCode(new Date(2027, 0, 15))).toBe("2627");
  });
  it("ohne Argument: nutzt jetzt (kein Throw, 4-stellig)", () => {
    expect(currentSaisonCode()).toMatch(/^\d{4}$/);
  });
});

describe("nextSaisonCode / prevSaisonCode", () => {
  it("nextSaisonCode 2526 → 2627", () => {
    expect(nextSaisonCode("2526")).toBe("2627");
  });
  it("nextSaisonCode 2930 → 3031", () => {
    expect(nextSaisonCode("2930")).toBe("3031");
  });
  it("nextSaisonCode ungültig → null", () => {
    expect(nextSaisonCode("foo")).toBeNull();
    expect(nextSaisonCode("")).toBeNull();
  });
  it("prevSaisonCode 2627 → 2526", () => {
    expect(prevSaisonCode("2627")).toBe("2526");
  });
  it("prevSaisonCode 2001 → 1920 (Jahrzehnt-Padding)", () => {
    expect(prevSaisonCode("2021")).toBe("1920");
  });
  it("prevSaisonCode ungültig → null", () => {
    expect(prevSaisonCode("26/27")).toBe("2526"); // Slash-Format toleriert
    expect(prevSaisonCode("x")).toBeNull();
  });
});

describe("saisonLabel", () => {
  it("2526 → 25/26", () => {
    expect(saisonLabel("2526")).toBe("25/26");
  });
  it("ungültig → Eingabe unverändert", () => {
    expect(saisonLabel("foo")).toBe("foo");
  });
});
