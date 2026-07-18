import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Die Marken-Bausteine für die Social-Assets.
 *
 * Palette und Schriften kommen aus `lib/og/*` — DERSELBEN Quelle, aus der die
 * Story- und Wrapped-Motive der App gerendert werden. Hier steht bewusst keine
 * eigene Kopie mehr: diese Datei hatte kurzzeitig ihre eigene Palette und ihre
 * eigene Display-Schrift, und schon beim ersten Marken-Umbau (#42, Montserrat
 * Alternates → KickPact Display) wäre der Marketing-Kanal in einer Schrift
 * gelaufen, die das Produkt gerade abgelegt hat. Genau die Divergenz, gegen die
 * die ganze Pipeline gebaut ist.
 *
 * Hier bleibt nur, was es im Produkt nicht gibt: die K-Marke als SVG, das weiße
 * Logo für Foto-Flächen, die Fotos, die Social-Formate.
 */

export {
  GREEN,
  GREEN_DARK,
  NAVY,
  OFF_WHITE,
  WHITE,
  NEUTRAL,
  LOGO_ON_LIGHT,
  LOGO_RATIO
} from "@/lib/og/brand";

export { OG_FONTS as FONTS, DISPLAY_FAMILY as DISPLAY, BODY_FAMILY as BODY, displayTextWidth } from "@/lib/og/fonts";

/* --------------------------------- Assets --------------------------------- */

const dataUri = (p: string) =>
  "data:image/png;base64," +
  readFileSync(join(process.cwd(), "public/brand", p)).toString("base64");

/** Auf Fotos: das zweifarbige Primärlogo säuft ab, weiß steht immer. */
export const LOGO_WHITE = dataUri("logo-white-horizontal.png");

/**
 * Die K-Marke als SVG. Satori rastert SVG-data-URIs sauber (geprüft), und als
 * Vektor skaliert sie auf jede Größe — das Primärlogo ist Pixel-only und würde
 * groß ausfransen.
 *
 * Achtung laut public/brand/README.md: die einfarbigen SVGs sind mit potrace aus
 * den PNGs nachgezeichnet und können minimal von der Original-Typo abweichen.
 * Für die MARKE (reines K-Icon, keine Schrift) ist das unkritisch; für die
 * Wortmarke bleibt deshalb das PNG die Quelle (LOGO_ON_LIGHT).
 */
const svgUri = (p: string) =>
  "data:image/svg+xml;base64," +
  readFileSync(join(process.cwd(), "public/brand", p)).toString("base64");

export const MARK_GREEN = svgUri("mark-green.svg");
export const MARK_WHITE = svgUri("mark-white.svg");

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

/* ------------------------------ Screenshots ------------------------------- */

/**
 * App-Screenshots aus `docs/marketing/screenshots/`, aufgenommen von
 * `npm run social:capture` gegen Staging mit dem Demo-Verein.
 *
 * NIE von Hand hineinlegen: handgemachte Screenshots veralten still. Die sieben,
 * die vorher im Repo-Root lagen, zeigten echte Vereinsnamen, ein Cookie-Banner,
 * einen leeren Ladezustand und Trigger-Typen, die es seit Juli nicht mehr gibt.
 * Aufnehmen ist ein Befehl — nach jedem Redesign sind sie in zwei Minuten neu.
 */
export type ScreenshotName = "dashboard" | "spiele-uebersicht" | "sponsor-dashboard";

const shotCache = new Map<string, string>();

export function screenshot(name: ScreenshotName): string {
  const hit = shotCache.get(name);
  if (hit) return hit;
  const file = join(process.cwd(), "docs/marketing/screenshots", `${name}.png`);
  if (!existsSync(file)) {
    throw new Error(
      `Screenshot "${name}" fehlt (${file}). Erst aufnehmen: npm run social:capture`
    );
  }
  const uri = "data:image/png;base64," + readFileSync(file).toString("base64");
  shotCache.set(name, uri);
  return uri;
}

/* -------------------------------- Typografie ------------------------------ */

/**
 * Schützt Zahl und Einheit vor dem Zeilenumbruch.
 *
 * Nicht kosmetisch: in einem Reel brach Satori „Außer es hängen 5 € pro Tor
 * drin." real zwischen „5" und „€" um, und zwar auf genau dem Beat, der die
 * Pointe trug. Ein Betrag, dessen Währung in der nächsten Zeile steht, liest
 * sich als Fehler, und der Post ist der erste Eindruck der Marke.
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
