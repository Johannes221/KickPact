/**
 * IBAN-Mod-97-Validierung (Zahlungsziel auf Sponsor-Zahlungsübersichten).
 * Ein Tippfehler in der Prüfziffer darf NICHT als „gültig" durchrutschen.
 */
import { describe, expect, it } from "vitest";
import { isValidIban, normalizeIban } from "@/lib/utils/iban";

describe("isValidIban", () => {
  it("akzeptiert gültige DE-IBAN (mit + ohne Leerzeichen)", () => {
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("de89370400440532013000")).toBe(true); // Kleinbuchstaben
  });

  it("akzeptiert gültige Auslands-IBAN", () => {
    expect(isValidIban("AT61 1904 3002 3457 3201")).toBe(true); // Österreich
    expect(isValidIban("CH93 0076 2011 6238 5295 7")).toBe(true); // Schweiz
  });

  it("lehnt den QA-Fund + kaputte Prüfziffern ab", () => {
    expect(isValidIban("DE00-ungültig-123")).toBe(false);
    expect(isValidIban("DE88370400440532013000")).toBe(false); // Prüfziffer 88 statt 89
    expect(isValidIban("DE89370400440532013001")).toBe(false); // letzte Stelle verdreht
  });

  it("lehnt Strukturmüll ab", () => {
    expect(isValidIban("")).toBe(false);
    expect(isValidIban("HALLO")).toBe(false);
    expect(isValidIban("1234567890123456")).toBe(false); // kein Ländercode
    expect(isValidIban("DEXX370400440532013000")).toBe(false); // Prüfziffer keine Zahl
  });

  it("normalizeIban strippt Leerzeichen + uppercased", () => {
    expect(normalizeIban(" de89 3704 ")).toBe("DE893704");
  });
});
