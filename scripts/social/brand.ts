import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Die KickPact-CI für Social-Assets. EINE Quelle für Karussells (render.tsx) und
 * Videos (video.tsx) — zwei Paletten hätten garantiert zwei Grüns ergeben.
 *
 * Werte aus public/brand/README.md und tailwind.config.ts, nicht geraten.
 *
 * ACHTUNG, das ist NICHT die Palette der Story-/Wrapped-Motive. Die laufen auf
 * Navy/Orange/Lime (lib/story/story-card.tsx). Johannes' Ansage vom 2026-07-17:
 * Weiß/Grün/Schwarz ist die CI, das Dunkle ist Fallback. Die Produkt-Motive
 * ziehen nach, sobald der Font-Fix drin ist (siehe docs/marketing/content-strategie.md).
 */

/* -------------------------------- Palette --------------------------------- */

export const GREEN = "#01C457"; // Primary Green — FLÄCHEN, Balken, Punkte
export const GREEN_DARK = "#00563A"; // Dark Green — grüner TEXT auf Weiß
export const NAVY = "#1A1A2E"; // Night Navy — das „Schwarz" der Marke
export const OFF_WHITE = "#F5F8F5";
export const WHITE = "#FFFFFF";
export const NEUTRAL = "#CDD2D1";

/**
 * Warum zwei Grüns, und warum das nicht kosmetisch ist:
 *
 * #01C457 auf Weiß hat ~2,4:1 Kontrast. Das reißt jede WCAG-Schwelle, auch die
 * 3:1 für große Schrift. Grüner Text auf weißem Grund ist damit für einen Teil
 * der Leute schlicht nicht lesbar, und auf einem Handy in der Sonne für alle.
 * Deshalb: #01C457 nur als FLÄCHE (dort trägt es), #00563A für grünen TEXT
 * (~8,4:1 auf Weiß).
 *
 * Umgekehrt auf grüner Fläche: Weiß darauf wäre wieder 2,4:1. Navy darauf sind
 * ~7:1. Also grüne Fläche = Navy-Text, nie weißer.
 */
export const ON_GREEN = NAVY;

/* --------------------------------- Fonts ---------------------------------- */

const FONT_ROOT = join(process.cwd(), "public/fonts");

const read = (p: string) => readFileSync(join(FONT_ROOT, p));

/**
 * Display = Montserrat Alternates, Body = Inter. So macht es die App
 * (app/layout.tsx: --font-display / --font-sans). Die Brand-README nennt für
 * Display noch „Inter Black" — die ist an der Stelle veraltet, der Code gewinnt.
 *
 * Satori kann kein woff2 und braucht echte Dateien, `next/font/google` zieht die
 * Schriften aber erst beim Build. Montserrat Alternates liegt deshalb als TTF unter
 * public/fonts/ (neu dazugeholt, OFL).
 *
 * BEWUSST ohne Inter-Black: die Headlines laufen auf Montserrat Alternates 900, Inter
 * wird hier nur als 400 (Body) und 700 (Kicker) gesetzt. Inter-Black gehört dem
 * Font-Fix der Bild-Routen (lib/og/fonts.ts), der die Datei per fontkit VERMISST, um
 * Headline-Breiten zu rechnen. Zwei Sessions hatten sie unabhängig geholt, mit
 * unterschiedlicher Prüfsumme — hier eine zweite Fassung einzuchecken hieße, deren
 * Kalibrierung zu zerschießen. Wer sie braucht, holt sie sich dort.
 */
export const FONTS = [
  { name: "Inter", data: read("inter/Inter-Regular.ttf"), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: read("inter/Inter-Bold.ttf"), weight: 700 as const, style: "normal" as const },
  { name: "Montserrat Alternates", data: read("montserrat-alternates/MontserratAlternates-Bold.ttf"), weight: 700 as const, style: "normal" as const },
  { name: "Montserrat Alternates", data: read("montserrat-alternates/MontserratAlternates-Black.ttf"), weight: 900 as const, style: "normal" as const }
];

export const DISPLAY = "Montserrat Alternates";
export const BODY = "Inter";

/* --------------------------------- Logos ---------------------------------- */

const dataUri = (p: string) =>
  "data:image/png;base64," +
  readFileSync(join(process.cwd(), "public/brand", p)).toString("base64");

/**
 * Primärlogo (2-farbig) für helle Flächen — die README ist da eindeutig: „Default
 * für alles auf hellen Hintergründen". Auf grüner Fläche verschwindet das grüne
 * PACT, also dort das Navy-Logo.
 */
export const LOGO_ON_LIGHT = dataUri("logo-horizontal.png");
export const LOGO_ON_GREEN = dataUri("logo-navy-horizontal.png");

/** Seitenverhältnis des horizontalen Logos, gemessen an der PNG (912×120). */
export const LOGO_RATIO = 912 / 120;

/* -------------------------------- Typografie ------------------------------ */

/**
 * Schützt Zahl und Einheit vor dem Zeilenumbruch.
 *
 * Nicht kosmetisch: im Reel „02-fuenf-euro-pro-tor" brach Satori „Außer es hängen
 * 5 € pro Tor drin." real zwischen „5" und „€" um, und zwar auf genau dem Beat,
 * der die Pointe trägt. Ein Betrag, dessen Währung in der nächsten Zeile steht,
 * liest sich als Fehler, und der Post ist der erste Eindruck der Marke.
 *
 * Läuft zentral im Renderer, nicht in den Inhaltsdateien: sonst müsste jeder,
 * der einen Preis tippt, an ein unsichtbares Sonderzeichen denken, und genau das
 * vergisst man.
 */
export function typo(s: string): string {
  // \u00A0 = geschütztes Leerzeichen. Als Escape geschrieben, nicht als getipptes
  // Zeichen: sonst sieht es im Editor wie ein normales Leerzeichen aus und fliegt
  // beim nächsten Anfassen still wieder raus.
  return s.replace(/(\d)\s+(€|%)/g, "$1\u00A0$2");
}

/* -------------------------------- Formate --------------------------------- */

/** Instagram-Feed 4:5 — das höchste Format, das der Feed ungeschnitten zeigt. */
export const SLIDE_SIZE = { width: 1080, height: 1350 } as const;
/** Reel / Story / TikTok. */
export const VERTICAL = { width: 1080, height: 1920 } as const;
