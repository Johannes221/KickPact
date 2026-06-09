import { describe, it, expect } from "vitest";
import { parse } from "node-html-parser";
import { parseDisplayedResult } from "@/lib/crawler/fussballde";

/**
 * `parseDisplayedResult` liest den angezeigten Endstand aus dem `.result`-Element
 * ("[H : G]"). Das ist die Score-Quelle für „nur Ergebnis"-Mannschaften (kein
 * Spielbericht, 0 Tor-Events) — vorher wurde dort fälschlich 0:0 aus den Events
 * berechnet.
 */
describe("parseDisplayedResult", () => {
  it("liest den Endstand aus '[0 : 4]'", () => {
    const root = parse('<div class="result">: [0 : 4]</div>');
    expect(parseDisplayedResult(root)).toEqual({ heim: 0, gast: 4 });
  });

  it("liest auch mehrstellige Stände '[12 : 1]'", () => {
    const root = parse('<span class="result">[12 : 1]</span>');
    expect(parseDisplayedResult(root)).toEqual({ heim: 12, gast: 1 });
  });

  it("null bei nicht eingetragenem Ergebnis '[- : -]'", () => {
    const root = parse('<div class="result">: [- : -]</div>');
    expect(parseDisplayedResult(root)).toBeNull();
  });

  it("null wenn kein .result-Element existiert", () => {
    const root = parse("<div class=\"stage\">kein Ergebnis</div>");
    expect(parseDisplayedResult(root)).toBeNull();
  });
});
