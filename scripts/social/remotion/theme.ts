import { staticFile } from "remotion";

/**
 * Marke für die Remotion-Reels — die BROWSER-Seite der Pipeline.
 *
 * Warum nicht `lib/og/brand.ts` importieren wie der Rest der Social-Skripte?
 * Remotion rendert die Komponenten in einem (Headless-)Chrome, nicht in Node.
 * `brand.ts`/`fonts.ts` lesen ihre Assets aber per `readFileSync` auf Modulebene
 * — im Browser-Bundle gibt es kein `fs`, das würde beim Rendern crashen. Deshalb
 * hier die Farbwerte gespiegelt (bewusst, mit Verweis) und die Assets über
 * `staticFile()` aus `public/` geladen statt als base64 eingelesen.
 *
 * Die Hex-Werte sind identisch zu lib/og/brand.ts — bei Änderung dort HIER
 * nachziehen. Es sind sieben Konstanten; ein Build-Schritt dafür wäre mehr
 * Apparat als die Sache wert.
 */

export const GREEN = "#01C457"; // Primary Green — Flächen, Balken, Ball-Streak
export const GREEN_DARK = "#00563A"; // grüner TEXT auf Weiß (Kontrast)
export const NAVY = "#1A1A2E"; // Night Navy — das „Schwarz" der Marke
export const OFF_WHITE = "#F5F8F5";
export const WHITE = "#FFFFFF";

export const DISPLAY = "KickPact Display";
export const BODY = "Inter";

/** Seitenverhältnis des horizontalen Logos (912×120), wie in brand.ts. */
export const LOGO_RATIO = 912 / 120;

/* --------------------------------- Assets --------------------------------- */
/* Alles unter public/ — Pfade relativ zu public/, wie staticFile() sie erwartet. */

export const LOGO_LIGHT = staticFile("brand/logo-horizontal.png"); // dunkel, für helle Fläche
export const LOGO_WHITE = staticFile("brand/logo-white-horizontal.png"); // für Foto/Navy
export const MARK_GREEN = staticFile("brand/mark-green.svg");
export const MARK_WHITE = staticFile("brand/mark-white.svg");

export type PhotoName =
  | "player-and-sponsor"
  | "team-celebration"
  | "team-branded-line"
  | "team-green"
  | "team-hero"
  | "team-white-mixed"
  | "team-youth";

export const photoSrc = (name: PhotoName): string => staticFile(`brand/photos/${name}.png`);

/**
 * Echte App-Screenshots (iPhone 390×844 @3x) aus docs/marketing/screenshots,
 * gespiegelt nach public/brand/app für staticFile. Aufgenommen mit dem Demo-
 * Verein (npm run social:capture) — echte Saison-Daten, keine echten Vereine.
 */
export type AppShot = "dashboard" | "spiele-uebersicht" | "sponsor-dashboard";
export const appShot = (name: AppShot): string => staticFile(`brand/app/${name}.png`);

/**
 * Die ECHTEN Saison-Wrapped-Karten (9:16), die ein Verein aus der App teilt —
 * geholt von der `wrapped-image`-Route des Demo-Vereins (scripts/social/
 * capture-wrapped.ts). Im Reel zeigen wir sie im iPhone-Rahmen: „so sieht dein
 * Rückblick echt aus". Echte Demo-Daten, kein realer Verein.
 */
export type WrappedSlide = "intro" | "bilanz" | "tabellenplatz" | "tore" | "torschuetze" | "zusammenfassung";
export const wrappedShot = (slide: WrappedSlide): string => staticFile(`brand/wrapped/${slide}.png`);

/**
 * Die ECHTEN Story-Bilder aus der App (9:16) — Spiel-Vorschau und -Rückblick,
 * geholt via scripts/social/capture.ts von der story-image-Route. Fürs
 * „Spiel ankündigen"-Reel: das Produkt zeigen statt behaupten.
 */
export type StoryShot = "spiel-vorschau" | "spiel-rueckblick";
export const storyShot = (name: StoryShot): string => staticFile(`brand/story/${name}.png`);

/* -------------------------------- Typografie ------------------------------ */

/**
 * Schützt „5 €" / „30 %" vor dem Zeilenumbruch (U+00A0 als Escape, damit es im
 * Editor sichtbar bleibt). Pure Funktion, hier dupliziert statt aus brand.ts
 * importiert — brand.ts zieht `fs` mit rein (s. o.).
 */
export const typo = (s: string): string => s.replace(/(\d)\s+(€|%)/g, "$1 $2");
