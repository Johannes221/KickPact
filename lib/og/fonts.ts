import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fontkit from "fontkit";

/**
 * Inter für next/og (Satori) — die Schrift aller Share-Motive.
 *
 * Ohne `fonts` fällt Satori auf seinen gebündelten Default zurück, und der hat
 * NUR einen Regular-Schnitt. Satori synthetisiert kein Fett, also rendert dann
 * jedes `fontWeight: 700/900` dünn: die Motive kamen live deutlich zarter raus
 * als entworfen (im Vergleichsrender gesehen — „HEIMSIEG" als Light-Schrift).
 * Jede `ImageResponse` in dieser App MUSS `fonts: OG_FONTS` übergeben.
 *
 * Einmalig auf Modulebene gelesen: die Motiv-Routen sind `force-dynamic`, ein
 * Lesen pro Request hieße ~1,2 MB von Platte bei jedem Aufruf.
 *
 * 400/700/900 decken alle Motive ab — Satori matcht nach dem CSS-Algorithmus,
 * `fontWeight: 800` landet damit deterministisch auf 900 (empirisch geprüft).
 */
const face = (file: string) =>
  readFileSync(join(process.cwd(), "public/fonts/inter", file));

const INTER_BLACK = face("Inter-Black.ttf");

export const OG_FONT_FAMILY = "Inter";

export const OG_FONTS = [
  { name: OG_FONT_FAMILY, data: face("Inter-Regular.ttf"), weight: 400 as const, style: "normal" as const },
  { name: OG_FONT_FAMILY, data: face("Inter-Bold.ttf"), weight: 700 as const, style: "normal" as const },
  { name: OG_FONT_FAMILY, data: INTER_BLACK, weight: 900 as const, style: "normal" as const }
];

/** Inter Black als vermessbare Schrift — für die Headline-Breite, s. unten. */
const blackFace = fontkit.create(INTER_BLACK) as fontkit.Font;

/**
 * Breite von `text` in px, gesetzt in Inter Black bei `fontSize` und `trackingEm`
 * (letter-spacing in em).
 *
 * Ersetzt das frühere Schätzen über eine mittlere Zeichenbreite: die war an der
 * FALSCHEN Schrift (Satoris Regular-Fallback) kalibriert und ist ohnehin je nach
 * Text meilenweit daneben — echtes Inter Black liegt zwischen 0,48 („SA., 01.08.")
 * und 0,75 („MORGEN") em pro Zeichen. Eine einzelne Konstante kann beides nicht
 * gleichzeitig treffen, und danebenliegen heißt hier: abgeschnittenes Wort auf
 * einer Instagram-Story.
 *
 * `trackingEm` wird bewusst nur (n−1)-mal gerechnet, obwohl Satori es hinter
 * JEDEM Zeichen addiert. Bei negativem Tracking überschätzt das die Breite leicht
 * — die Richtung, in der ein Fehler folgenlos bleibt (Text minimal kleiner statt
 * über den Rand).
 */
export function blackTextWidth(text: string, fontSize: number, trackingEm = 0): number {
  const run = blackFace.layout(text);
  const glyphWidth = (run.advanceWidth / blackFace.unitsPerEm) * fontSize;
  return glyphWidth + trackingEm * fontSize * Math.max(text.length - 1, 0);
}
