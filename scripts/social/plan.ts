/**
 * Der Redaktionsplan — DIE eine Quelle, wann was rausgeht.
 *
 * Zwei getrennte Spuren, damit nichts doppelt wirkt:
 *
 *   group "highlight" — die Story-Highlights. KEIN Feed: einmal posten und ans
 *     Profil PINNEN (das „Erklär-Regal", immer sichtbar). Stehen neben dem Feed.
 *
 *   group "feed" — die Beiträge im Raster (Reels + Karussells), in Reihenfolge.
 *     Regeln: nie dasselbe THEMA direkt hintereinander, jeder Post ein anderer
 *     ANGLE als der davor. Ein Thema darf als Reel UND als Karussell vorkommen —
 *     aber mit ~10+ Tagen Abstand und anderem Format. Samstage bleiben leer.
 *
 * Reels laufen `manual` (du postest sie mit Musik — die API kann keine).
 * Highlights ebenfalls `manual` (Posten + Anpinnen in einem Rutsch in der App).
 * Automatisch läuft nur, was im Feed steht und nicht manual ist: die Karussells.
 *
 * `interactive` = Engagement-Post: beim Posten in der App zusätzlich einen
 * Frage-/Umfrage-Sticker setzen bzw. eine „Kommentiert 👇"-Aufforderung — das
 * treibt Reichweite (Kommentare = Signal). Der Text steht dabei; der Sticker
 * kommt manuell dazu.
 *
 * Stand: neu geschrieben am 2026-07-21. Das Reel „So funktioniert ein Pact"
 * (01) wurde am 20.07. bereits gepostet → NICHT mehr im Feed (die Erklärung
 * kommt später nur noch einmal als KARUSSELL, anderes Format).
 */

export interface PlanItem {
  group: "feed" | "highlight";
  /** Ortszeit-Datum "YYYY-MM-DD". */
  at: string;
  kind: "reel" | "story" | "karussell";
  /** Slug wie in spots.ts / stories.ts / decks.ts. */
  slug: string;
  /** Klartext-Titel für die Übersicht. */
  title: string;
  /** Der Angle — steht in der Übersicht, damit die Abwechslung sichtbar ist. */
  angle: string;
  /** true = du postest von Hand. Reels (Musik) und Highlights (Anpinnen). */
  manual?: boolean;
  /** Gesetzt = Engagement-Post: Frage-/Umfrage-Sticker oder „Kommentiert 👇". */
  interactive?: string;
}

export const PLAN: PlanItem[] = [
  /* ── Feed: ein Angle nach dem anderen, ab heute (21.07.) ───────────────────
   * Heute der virale Aufhänger (Wrapped-Reel). Danach abwechselnd Karussell/Reel,
   * kein Thema/Angle am Stück, zwei interaktive Posts zwischendrin.
   * Angle-Folge: Rückblick → Einwand → Kasse → Features → Erklärung → Spieltag →
   *              Rückblick → Kasse → Features
   */
  { group: "feed", at: "2026-07-21", kind: "reel", slug: "04-saison-rueckblick", title: "Saison-Rückblick (Wrapped)", angle: "Rückblick", manual: true },
  { group: "feed", at: "2026-07-23", kind: "karussell", slug: "04-vier-fragen", title: "Vier Fragen aus dem Vorstand", angle: "Einwand", interactive: "Frage-Sticker setzen (Welche Frage habt ihr noch?) + zum Kommentieren einladen" },
  { group: "feed", at: "2026-07-26", kind: "reel", slug: "03-wer-sponsert-euch", title: "Wer sponsert euch", angle: "Kasse", manual: true },
  { group: "feed", at: "2026-07-28", kind: "karussell", slug: "02-was-ihr-festlegen-koennt", title: "Was ihr festlegen könnt", angle: "Features", interactive: "Kommentiert: Welchen Pact würdet ihr nehmen? + optional Umfrage-Sticker" },
  { group: "feed", at: "2026-07-30", kind: "karussell", slug: "01-so-funktioniert-ein-pact", title: "So funktioniert ein Pact", angle: "Erklärung" },
  { group: "feed", at: "2026-08-02", kind: "reel", slug: "06-spiel-ankuendigen", title: "Spiel ankündigen", angle: "Spieltag", manual: true },
  { group: "feed", at: "2026-08-04", kind: "karussell", slug: "05-saison-rueckblick", title: "Saison-Rückblick (Wrapped)", angle: "Rückblick" },
  { group: "feed", at: "2026-08-06", kind: "karussell", slug: "03-wer-sponsert-euch", title: "Wer sponsert euch", angle: "Kasse" },
  { group: "feed", at: "2026-08-09", kind: "reel", slug: "02-was-ihr-festlegen-koennt", title: "Was ihr festlegen könnt", angle: "Features", manual: true },

  /* ── Highlights: einmal einrichten und anpinnen (diese Woche) ──────────── */
  { group: "highlight", at: "2026-07-22", kind: "story", slug: "wie-funktioniert-das", title: "Wie funktioniert das", angle: "Erklärung", manual: true },
  { group: "highlight", at: "2026-07-24", kind: "story", slug: "was-kostet-das", title: "Was kostet das", angle: "Preis", manual: true },
  { group: "highlight", at: "2026-07-27", kind: "story", slug: "was-kann-ich-festlegen", title: "Was kann ich festlegen", angle: "Features", manual: true },
  { group: "highlight", at: "2026-07-29", kind: "story", slug: "haeufige-fragen", title: "Häufige Fragen", angle: "Einwand", manual: true },
  { group: "highlight", at: "2026-07-31", kind: "story", slug: "spieltag-story", title: "Spiel ankündigen", angle: "Spieltag", manual: true }
];
