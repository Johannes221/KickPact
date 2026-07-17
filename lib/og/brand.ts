import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Die KickPact-CI für gerenderte Bilder — Produkt-Motive (Story, Wrapped, OG)
 * UND Social-Posts (scripts/social/*).
 *
 * EINE Quelle, bewusst: zwei Paletten hätten garantiert zwei Grüns ergeben, und
 * dann postet der Marketing-Kanal ein anderes Produkt, als die App ausliefert.
 * Werte aus public/brand/README.md und tailwind.config.ts, nicht geraten.
 *
 * Weiß/Grün/Navy ist die Marke. Das frühere Navy/Orange/Lime der Motive war
 * Fallback und ist raus (Johannes, 2026-07-17) — Orange und Lime kommen in der
 * CI schlicht nicht vor.
 */

/* -------------------------------- Palette --------------------------------- */

export const GREEN = "#01C457"; // Primary Green — FLÄCHEN, Balken, Punkte
export const GREEN_DARK = "#00563A"; // Dark Green — grüner TEXT auf Weiß
export const NAVY = "#1A1A2E"; // Night Navy — das „Schwarz" der Marke
export const ALERT_RED = "#FF3127";
export const OFF_WHITE = "#F5F8F5";
export const WHITE = "#FFFFFF";
export const NEUTRAL = "#CDD2D1";

/**
 * Warum zwei Grüns, und warum das nicht kosmetisch ist (nachgerechnet):
 *
 * #01C457 auf Weiß sind 2,32:1. Das reißt jede WCAG-Schwelle, auch die 3:1 für
 * große Schrift. Grüner Text auf weißem Grund ist damit für einen Teil der Leute
 * nicht lesbar, und auf einem Handy in der Sonne für alle. Deshalb: #01C457 nur
 * als FLÄCHE (dort trägt es), #00563A für grünen TEXT (8,78:1 auf Weiß).
 *
 * Umgekehrt auf grüner Fläche: Weiß darauf wäre wieder 2,32:1, Navy sind 7,34:1.
 * Also grüne Fläche = Navy-Text, nie weißer.
 */
export const ON_GREEN = NAVY;

/* --------------------------------- Logos ---------------------------------- */

const dataUri = (p: string) =>
  "data:image/png;base64," +
  readFileSync(join(process.cwd(), "public/brand", p)).toString("base64");

/**
 * next/og (Satori) bettet lokale Assets nur als data-URI/absolute-URL zuverlässig
 * ein — deshalb base64, einmalig auf Modulebene.
 *
 * Primärlogo (2-farbig: grüne Marke, KICK navy, PACT grün) für helle Flächen —
 * die Brand-README ist da eindeutig: „Default für alles auf hellen Hintergründen".
 * Auf grüner Fläche verschwindet das grüne PACT, also dort das Navy-Logo.
 *
 * Die Wortmarke ist BILD, nicht Text: eine saubere 2-farbige Vektor-Wortmarke
 * existiert nicht (README: „es gibt keine Font-/Designdatei dafür"). „KickPact"
 * in einer beliebigen Schrift zu tippen ist nicht das Logo — genau das lief im
 * OG-Bild und sah deshalb falsch aus (weiß/orange statt schwarz/grün).
 */
export const LOGO_ON_LIGHT = dataUri("logo-horizontal.png");
export const LOGO_ON_GREEN = dataUri("logo-navy-horizontal.png");

/** Seitenverhältnis des horizontalen Logos, gemessen an der PNG (912×120). */
export const LOGO_RATIO = 912 / 120;
