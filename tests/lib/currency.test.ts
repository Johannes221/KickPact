/**
 * Unit-Tests für lib/utils/currency.ts — der kanonische Ort für alle
 * EUR-Format-Helper (de-DE). Vorher existierten ~40 lokale Kopien.
 */
import { describe, expect, it } from "vitest";
import { eur, eurNoSign, eurOrDash, eurCsv } from "@/lib/utils/currency";

// de-DE nutzt non-breaking space (U+00A0) zwischen Betrag und €.
const NBSP = " ";

describe("eur", () => {
  it("formatiert Cents als de-DE-Währung", () => {
    expect(eur(123456)).toBe(`1.234,56${NBSP}€`);
  });
  it("formatiert 0 Cents", () => {
    expect(eur(0)).toBe(`0,00${NBSP}€`);
  });
  it("formatiert negative Beträge", () => {
    expect(eur(-500)).toBe(`-5,00${NBSP}€`);
  });
});

describe("eurNoSign", () => {
  it("formatiert ohne €-Zeichen, immer 2 Nachkommastellen", () => {
    expect(eurNoSign(123456)).toBe("1.234,56");
    expect(eurNoSign(500)).toBe("5,00");
  });
});

describe("eurOrDash", () => {
  it("null/undefined → Gedankenstrich", () => {
    expect(eurOrDash(null)).toBe("—");
    expect(eurOrDash(undefined)).toBe("—");
  });
  it("Zahl → Währungsformat", () => {
    expect(eurOrDash(500)).toBe(`5,00${NBSP}€`);
  });
});

describe("eurCsv", () => {
  it("Excel-DE: Komma-Dezimaltrenner, KEINE Tausenderpunkte", () => {
    expect(eurCsv(123456)).toBe("1234,56");
    expect(eurCsv(500)).toBe("5,00");
  });
  it("null/undefined → leerer String", () => {
    expect(eurCsv(null)).toBe("");
    expect(eurCsv(undefined)).toBe("");
  });
});
