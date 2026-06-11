import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { parse } from "node-html-parser";
import * as fontkit from "fontkit";
import { parseDisplayedHalftime } from "@/lib/crawler/fussballde";
import {
  decodeObfuscatedScore,
  type ScoreFont,
  type ScoreFontLoader
} from "@/lib/crawler/score-font";

/**
 * Markup + Font sind 1:1 von einer echten fussball.de-Detailseite übernommen
 * (SV 98 Schwetzingen – FC Sportfr. Dossenheim, 31.05.2026, Endstand 2:7,
 * Halbzeit 2:4; Probe vom 2026-06-10):
 *  - `.end-result`: Endstand als PUA-Codepoints, dekodierbar nur über den
 *    Obfuscation-Font (`data-obfuscation`-ID). 0xE65B→"two", 0xE65D→"seven".
 *  - `.half-result`: HALBZEIT im Klartext "[2 : 4]".
 * Der Bug vom 2026-06-09 las die Klammer als Endstand → 63 Spiele bekamen
 * Halbzeitstände als Ergebnis. Diese Tests nageln die Trennung fest.
 */
const REAL_RESULT_HTML =
  '<div class="result">' +
  '<span class="end-result">' +
  '<span data-obfuscation="xzr9j2gg" class="score-left">&#xE65B;</span>' +
  '<span class="colon">:</span>' +
  '<span data-obfuscation="xzr9j2gg" class="score-right">&#xE65D;</span>' +
  '<sub>&nbsp;<span class="icon-verified"></span></sub>' +
  "</span>" +
  '<span class="half-result">[2 : 4]</span>' +
  "</div>";

const fixtureFont = fontkit.create(
  readFileSync(
    join(__dirname, "../../fixtures/scraper/fonts/fortuna-xzr9j2gg.ttf")
  )
) as unknown as ScoreFont;

const fixtureLoader: ScoreFontLoader = async (id) =>
  id === "xzr9j2gg" ? fixtureFont : null;

describe("parseDisplayedHalftime", () => {
  it("liest die Halbzeit aus '.half-result' — NICHT den Endstand", () => {
    const root = parse(REAL_RESULT_HTML);
    expect(parseDisplayedHalftime(root)).toEqual({ heim: 2, gast: 4 });
  });

  it("Fallback: Klammer direkt im .result-Text (Legacy-Markup)", () => {
    const root = parse('<div class="result">: [12 : 1]</div>');
    expect(parseDisplayedHalftime(root)).toEqual({ heim: 12, gast: 1 });
  });

  it("null bei nicht eingetragener Halbzeit '[- : -]'", () => {
    const root = parse(
      '<div class="result"><span class="half-result">[- : -]</span></div>'
    );
    expect(parseDisplayedHalftime(root)).toBeNull();
  });

  it("null wenn kein .result-Element existiert", () => {
    const root = parse('<div class="stage">kein Ergebnis</div>');
    expect(parseDisplayedHalftime(root)).toBeNull();
  });
});

describe("decodeObfuscatedScore", () => {
  it("dekodiert den verschleierten Endstand 2:7 (nicht die Halbzeit 2:4)", async () => {
    const root = parse(REAL_RESULT_HTML);
    await expect(decodeObfuscatedScore(root, fixtureLoader)).resolves.toEqual({
      heim: 2,
      gast: 7
    });
  });

  it("dekodiert mehrstellige Stände (0xE663→'1', 0xE650→'2' ⇒ 12:1)", async () => {
    const root = parse(
      '<div class="result"><span class="end-result">' +
        '<span data-obfuscation="xzr9j2gg" class="score-left">&#xE663;&#xE650;</span>' +
        '<span class="colon">:</span>' +
        '<span data-obfuscation="xzr9j2gg" class="score-right">&#xE663;</span>' +
        "</span></div>"
    );
    await expect(decodeObfuscatedScore(root, fixtureLoader)).resolves.toEqual({
      heim: 12,
      gast: 1
    });
  });

  it("ignoriert verschachtelte Tags im Score-Span (icon-verified INNERHALB von .score-right)", async () => {
    // Matchplan-Listen (ajax.team.matchplan) rendern das Verified-Icon IM
    // Score-Span — die Bindestriche aus `class="icon-verified"` dürfen nicht
    // als Score-Zeichen gelesen werden (Capture-Befund 2026-06-11: alle
    // Vorsaison-Scores dekodierten zu null).
    const root = parse(
      '<div class="result"><span class="end-result">' +
        '<span data-obfuscation="xzr9j2gg" class="score-left">&#xE65B;</span>' +
        '<span class="colon">:</span>' +
        '<span data-obfuscation="xzr9j2gg" class="score-right">&#xE65D;<span class="icon-verified"></span></span>' +
        "</span></div>"
    );
    await expect(decodeObfuscatedScore(root, fixtureLoader)).resolves.toEqual({
      heim: 2,
      gast: 7
    });
  });

  it("null bei '-'-Platzhalter (Spiel ohne eingetragenes Ergebnis)", async () => {
    // 0xE656 → Glyphe "hyphen" im Fixture-Font.
    const root = parse(
      '<div class="result"><span class="end-result">' +
        '<span data-obfuscation="xzr9j2gg" class="score-left">&#xE656;</span>' +
        '<span class="colon">:</span>' +
        '<span data-obfuscation="xzr9j2gg" class="score-right">&#xE656;</span>' +
        "</span></div>"
    );
    await expect(
      decodeObfuscatedScore(root, fixtureLoader)
    ).resolves.toBeNull();
  });

  it("null ohne .end-result-Markup — und lädt dann keinen Font", async () => {
    const loader = vi.fn(fixtureLoader);
    const root = parse('<div class="result">: [2 : 4]</div>');
    await expect(decodeObfuscatedScore(root, loader)).resolves.toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it("null wenn der Font nicht ladbar ist (Fallback auf Event-Zählung)", async () => {
    const root = parse(REAL_RESULT_HTML);
    const failingLoader: ScoreFontLoader = async () => null;
    await expect(
      decodeObfuscatedScore(root, failingLoader)
    ).resolves.toBeNull();
  });

  it("null bei unbekannter Glyphe statt Raten", async () => {
    const root = parse(
      '<div class="result"><span class="end-result">' +
        // 0xF000 ist im Fixture-Font nicht gemappt (.notdef).
        '<span data-obfuscation="xzr9j2gg" class="score-left">&#xF000;</span>' +
        '<span class="colon">:</span>' +
        '<span data-obfuscation="xzr9j2gg" class="score-right">&#xE65D;</span>' +
        "</span></div>"
    );
    await expect(
      decodeObfuscatedScore(root, fixtureLoader)
    ).resolves.toBeNull();
  });
});
