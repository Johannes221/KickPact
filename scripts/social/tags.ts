/**
 * Die Hashtags unter jedem Feed-Post — EINE Quelle, an alle Captions angehängt.
 *
 * Mischung aus breit (#fußball) und eng (#kreisliga, #amateurfußball): die engen
 * bringen die richtige Zielgruppe, die breiten die Reichweite. Bewusst beide
 * Schreibweisen (ß und ss), weil danach unterschiedlich gesucht wird.
 *
 * Ändern? Nur hier — render.tsx (Karussells) und video.tsx (Reels) hängen das an.
 * Stories/Highlights kriegen KEINE Caption-Hashtags: eine Story hat keine
 * Beschreibung im Feed-Sinn, dort nimmt man Hashtag-Sticker in der App.
 */
export const HASHTAGS = [
  "#fußball",
  "#amateurfußball",
  "#kreisliga",
  "#kreisklasse",
  "#vereinsfußball",
  "#vereinsleben",
  "#mannschaftskasse",
  "#sponsoring",
  "#teamsponsoring",
  "#jugendfußball",
  "#fußballliebe",
  "#amateurfussball",
  "#fussball",
  "#kickpact"
];

export const HASHTAG_LINE = HASHTAGS.join(" ");
