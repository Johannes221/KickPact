/**
 * Dekodierung des verschleierten Endstands auf fussball.de-Detailseiten.
 *
 * fussball.de rendert den Endstand NICHT als Klartext: die Ziffern in
 * `.result .end-result .score-left/.score-right` sind Private-Use-Area-
 * Codepoints (U+E000–U+F8FF), die erst ein pro Seite ausgelieferter Webfont
 * (ID im `data-obfuscation`-Attribut) auf echte Ziffern abbildet. Im Klartext
 * steht im `.result` nur die HALBZEIT (`.half-result`, "[H : G]") — sie als
 * Endstand zu lesen war der Halbzeit-Parser-Bug vom 2026-06-09/10.
 *
 * Der Font verrät seine eigene Abbildung: die Glyphen heißen wörtlich
 * "zero"…"nine" bzw. "hyphen" (post-Table). Codepoint → Glyph → Name → Ziffer.
 */
import { fetch as undiciFetch } from "undici";
import * as fontkit from "fontkit";
import type { HTMLElement } from "node-html-parser";

/** Minimal-Interface eines geladenen Fonts — erlaubt Test-Injection. */
export interface ScoreFont {
  glyphForCodePoint(codePoint: number): { name?: string | null } | null;
}

export type ScoreFontLoader = (
  obfuscationId: string
) => Promise<ScoreFont | null>;

const GLYPH_NAME_TO_CHAR: Readonly<Record<string, string>> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  hyphen: "-"
};

const FONT_URL = (id: string) =>
  `https://www.fussball.de/export.fontface/-/format/ttf/id/${id}/type/font`;

/**
 * Font-Cache pro Obfuscation-ID. fussball.de liefert pro Seite/Session die
 * gleiche ID für alle Score-Spans; die Fonts sind winzig (~5 KB). Fehlschläge
 * werden NICHT gecached (Promise wird bei Rejection entfernt), damit ein
 * transienter Netzwerkfehler nicht den ganzen Crawl-Lauf vergiftet.
 */
const fontCache = new Map<string, Promise<ScoreFont | null>>();

async function fetchScoreFont(id: string): Promise<ScoreFont | null> {
  const res = await undiciFetch(FONT_URL(id), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "de-DE,de;q=0.9"
    },
    redirect: "follow"
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // Block-/HTML-Seite statt Font (z.B. Captcha-Redirect) → kein TTF-Magic.
  if (buf.length < 100) return null;
  const font = fontkit.create(buf);
  // Font-Kollektionen kommen hier nie vor; defensiv trotzdem abfangen.
  if (!("glyphForCodePoint" in font)) return null;
  return font as unknown as ScoreFont;
}

const defaultLoader: ScoreFontLoader = (id) => {
  let cached = fontCache.get(id);
  if (!cached) {
    cached = fetchScoreFont(id).catch((err) => {
      fontCache.delete(id);
      throw err;
    });
    fontCache.set(id, cached);
  }
  return cached;
};

/**
 * Extrahiert die relevanten Codepoints eines Score-Spans. node-html-parser
 * dekodiert numerische Entities (`&#xE65B;`) je nach Version unterschiedlich —
 * deshalb beide Formen unterstützen: literale PUA-Zeichen UND rohe Entities.
 * Klartext-Ziffern/Bindestrich werden direkt übernommen (falls fussball.de
 * die Verschleierung je abschaltet).
 */
function extractScoreText(span: HTMLElement): {
  puaCodepoints: number[];
  plainText: string;
} {
  // Verschachtelte Tags entfernen, BEVOR Zeichen gescannt werden: die
  // Matchplan-Listen rendern `<span class="icon-verified"></span>` INNERHALB
  // des Score-Spans — die Bindestriche des Klassennamens würden sonst als
  // Score-Zeichen ("-") gelesen und jede Dekodierung scheitern lassen.
  const raw = span.innerHTML.replace(/<[^>]*>/g, "");
  const puaCodepoints: number[] = [];
  let plain = "";

  // Rohe numerische Entities einsammeln und aus dem Resttext entfernen.
  const withoutEntities = raw.replace(
    /&#x([0-9a-fA-F]+);|&#(\d+);/g,
    (_, hex: string | undefined, dec: string | undefined) => {
      const cp = hex ? parseInt(hex, 16) : parseInt(dec ?? "", 10);
      if (!Number.isNaN(cp)) puaCodepoints.push(cp);
      return "";
    }
  );
  for (const ch of withoutEntities) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0xe000 && cp <= 0xf8ff) puaCodepoints.push(cp);
    else if (/[\d-]/.test(ch)) plain += ch;
  }
  return {
    puaCodepoints: puaCodepoints.filter((cp) => cp >= 0xe000 && cp <= 0xf8ff),
    plainText: plain
  };
}

async function decodeSide(
  span: HTMLElement,
  loadFont: ScoreFontLoader
): Promise<string | null> {
  const { puaCodepoints, plainText } = extractScoreText(span);
  if (puaCodepoints.length === 0) return plainText || null;

  const obfuscationId = span.getAttribute("data-obfuscation");
  if (!obfuscationId) return null;
  let font: ScoreFont | null;
  try {
    font = await loadFont(obfuscationId);
  } catch {
    return null;
  }
  if (!font) return null;

  let out = plainText;
  for (const cp of puaCodepoints) {
    const name = font.glyphForCodePoint(cp)?.name;
    const ch = name ? GLYPH_NAME_TO_CHAR[name] : undefined;
    if (ch === undefined) return null; // unbekannte Glyphe → nicht raten
    out += ch;
  }
  return out;
}

/**
 * Dekodiert ein `.score-left`/`.score-right`-Span-PAAR zu einem numerischen
 * Ergebnis. Generische Basis für alle font-verschleierten Score-Darstellungen
 * auf fussball.de — die Detailseite (`.result .end-result`, siehe
 * {@link decodeObfuscatedScore}) und die Spielplan-Listen
 * (`ajax.team.matchplan`, siehe lib/crawler/vorsaison.ts) nutzen exakt
 * dasselbe Markup-Muster (PUA-Codepoints + `data-obfuscation`-Font-ID).
 *
 * `null`, wenn das Ergebnis nicht SICHER dekodierbar ist: fehlende Spans,
 * "-"-Platzhalter (kein Ergebnis eingetragen), Font nicht ladbar, unbekannte
 * Glyphen. Niemals raten.
 */
export async function decodeScoreSpanPair(
  left: HTMLElement | null,
  right: HTMLElement | null,
  loadFont: ScoreFontLoader = defaultLoader
): Promise<{ heim: number; gast: number } | null> {
  if (!left || !right) return null;

  const [heimStr, gastStr] = await Promise.all([
    decodeSide(left, loadFont),
    decodeSide(right, loadFont)
  ]);
  if (!heimStr || !gastStr) return null;
  if (!/^\d+$/.test(heimStr) || !/^\d+$/.test(gastStr)) return null;
  return { heim: parseInt(heimStr, 10), gast: parseInt(gastStr, 10) };
}

/**
 * Dekodiert den angezeigten ENDSTAND aus dem `.result .end-result`-Block.
 *
 * `null`, wenn kein Endstand vorliegt oder er nicht sicher dekodierbar ist:
 * fehlendes Markup, "-"-Platzhalter (Spiel ohne Ergebnis), Font nicht ladbar,
 * unbekannte Glyphen. Der Aufrufer fällt dann auf die Tor-Event-Zählung
 * zurück — niemals auf die Klartext-Klammer (= Halbzeit!).
 */
export async function decodeObfuscatedScore(
  root: HTMLElement,
  loadFont: ScoreFontLoader = defaultLoader
): Promise<{ heim: number; gast: number } | null> {
  return decodeScoreSpanPair(
    root.querySelector(".result .end-result .score-left"),
    root.querySelector(".result .end-result .score-right"),
    loadFont
  );
}
