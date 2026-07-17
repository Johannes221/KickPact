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
 * 3:1 für große Schrift. Grüner TEXT auf weißem Grund ist damit für einen Teil
 * der Leute schlicht nicht lesbar, und auf einem Handy in der Sonne für alle.
 * Deshalb steht grüner Text immer in GREEN_DARK (~8,4:1 auf Weiß), und GREEN
 * bleibt kleinen Flächen vorbehalten: Marke, Balken, Punkte.
 *
 * Falls je wieder eine grüne Vollfläche kommt (aktuell bewusst nicht, siehe
 * decks.ts): Weiß darauf wäre wieder 2,4:1, Navy darauf sind ~7:1. Grüne Fläche
 * hieße also Navy-Text, nie weißen.
 */

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
 * für alles auf hellen Hintergründen". Da alle Flächen außer den Fotos weiß sind,
 * ist das hier der Normalfall.
 */
export const LOGO_ON_LIGHT = dataUri("logo-horizontal.png");
/** Auf Fotos: das zweifarbige Primärlogo säuft ab, weiß steht immer. */
export const LOGO_WHITE = dataUri("logo-white-horizontal.png");

/** Seitenverhältnis des horizontalen Logos, gemessen an der PNG (912×120). */
export const LOGO_RATIO = 912 / 120;

/**
 * Die K-Marke als SVG. Satori rastert SVG-data-URIs sauber (geprüft), und als
 * Vektor skaliert sie auf jede Größe — das Primärlogo ist Pixel-only und würde
 * groß ausfransen.
 *
 * Achtung laut public/brand/README.md: die einfarbigen SVGs sind mit potrace aus
 * den PNGs nachgezeichnet und können minimal von der Original-Typo abweichen.
 * Für die MARKE (reines K-Icon, keine Schrift) ist das unkritisch; für die
 * Wortmarke bleibt deshalb das PNG die Quelle (s. LOGO_ON_LIGHT).
 */
const svgUri = (p: string) =>
  "data:image/svg+xml;base64," +
  readFileSync(join(process.cwd(), "public/brand", p)).toString("base64");

export const MARK_GREEN = svgUri("mark-green.svg");
export const MARK_WHITE = svgUri("mark-white.svg");

/** Die Marke ist quadratisch (viewBox 0 0 1254 1254). */
export const MARK_RATIO = 1;

/* --------------------------------- Fotos ---------------------------------- */

/**
 * Die echten Fotos aus public/brand/photos/. Sieben Stück, je ~2 MB.
 *
 * Lazy und gecacht: alle auf einmal einzulesen wären ~19 MB Base64 im Speicher,
 * und ein Deck benutzt selten mehr als zwei.
 *
 * Warum echte Fotos und keine KI-Bilder: Leute, die jedes Wochenende auf einem
 * echten Platz stehen, sehen einem generierten Fußballplatz das sofort an.
 */
export type PhotoName =
  | "player-and-sponsor"
  | "team-celebration"
  | "team-branded-line"
  | "team-green"
  | "team-hero"
  | "team-white-mixed"
  | "team-youth";

const photoCache = new Map<string, string>();

export function photo(name: PhotoName): string {
  const hit = photoCache.get(name);
  if (hit) return hit;
  const uri =
    "data:image/png;base64," +
    readFileSync(join(process.cwd(), "public/brand/photos", `${name}.png`)).toString("base64");
  photoCache.set(name, uri);
  return uri;
}

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
