import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fontkit from "fontkit";

/**
 * Die Schriften für next/og (Satori) — Produkt-Motive UND Social-Posts.
 *
 * Ohne `fonts` fällt Satori auf sein gebündeltes Noto Sans zurück, und das hat
 * NUR einen Regular-Schnitt. Satori synthetisiert kein Fett, also rendert dann
 * jedes `fontWeight: 700/900` dünn: die Motive kamen live deutlich zarter raus
 * als entworfen (im Vergleichsrender gesehen — „HEIMSIEG" als Light-Schrift).
 * Jede `ImageResponse` in dieser App MUSS `fonts: OG_FONTS` übergeben.
 *
 * Einmalig auf Modulebene gelesen: die Motiv-Routen sind `force-dynamic`, ein
 * Lesen pro Request hieße knapp 1 MB von Platte bei jedem Aufruf.
 *
 * Display = KickPact Display, Body = Inter — dieselben Schriften wie App und
 * Website (app/layout.tsx). EINE Display-Schrift überall, damit der geteilte
 * Beleg aussieht wie die Seite, von der er kommt.
 *
 * KickPact Display ist Orbitron Black mit reparierter Null — Orbitron zeichnet
 * sie durchgestrichen, „6:0" wurde zu „6:Ø". Details und Neubau:
 * public/fonts/kickpact-display/README.md + scripts/build-display-font.py.
 *
 * Satori kann kein woff2 und braucht echte Dateien, `next/font/local` zieht die
 * Schriften erst beim Build — deshalb die TTFs unter public/fonts/.
 */
const face = (p: string) => readFileSync(join(process.cwd(), "public/fonts", p));

const DISPLAY_BLACK = face("kickpact-display/KickPactDisplay-Black.ttf");

export const DISPLAY_FAMILY = "KickPact Display";
export const BODY_FAMILY = "Inter";

export const OG_FONTS = [
  { name: BODY_FAMILY, data: face("inter/Inter-Regular.ttf"), weight: 400 as const, style: "normal" as const },
  { name: BODY_FAMILY, data: face("inter/Inter-Bold.ttf"), weight: 700 as const, style: "normal" as const },
  { name: DISPLAY_FAMILY, data: DISPLAY_BLACK, weight: 900 as const, style: "normal" as const }
];

/** Die Display-Schrift als vermessbare Schrift — für die Headline-Breite, s. unten. */
const displayFace = fontkit.create(DISPLAY_BLACK) as fontkit.Font;

/**
 * Breite von `text` in px, gesetzt in der Display-Schrift (Orbitron Black) bei `fontSize` und `trackingEm` (letter-spacing in em).
 *
 * Ersetzt das frühere Schätzen über eine mittlere Zeichenbreite: die war an der
 * FALSCHEN Schrift (Satoris Regular-Fallback) kalibriert und ist ohnehin je nach
 * Text meilenweit daneben. Gemessen wird gegen die Datei, die auch gerendert wird
 * — eine Schätzung gegen die falsche Schrift war genau der Bug.
 *
 * `trackingEm` wird bewusst nur (n−1)-mal gerechnet, obwohl Satori es hinter
 * JEDEM Zeichen addiert. Bei negativem Tracking überschätzt das die Breite leicht
 * — die Richtung, in der ein Fehler folgenlos bleibt (Text minimal kleiner statt
 * über den Rand).
 */
export function displayTextWidth(text: string, fontSize: number, trackingEm = 0): number {
  const run = displayFace.layout(text);
  const glyphWidth = (run.advanceWidth / displayFace.unitsPerEm) * fontSize;
  return glyphWidth + trackingEm * fontSize * Math.max(text.length - 1, 0);
}
