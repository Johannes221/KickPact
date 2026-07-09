import { describe, it, expect } from "vitest";
import { isResultCorrection } from "@/lib/crawler/match-finished-event";

describe("isResultCorrection", () => {
  it("scheduled-Stub (contentHash === null) → false (erstes Ergebnis, Push feuert)", () => {
    expect(isResultCorrection(null)).toBe(false);
  });

  it("schon fertiges Spiel (contentHash gesetzt) → true (Nachkorrektur, still)", () => {
    expect(isResultCorrection("abc123")).toBe(true);
    expect(isResultCorrection("")).toBe(true); // leerer String ist ein gesetzter Hash
  });
});
