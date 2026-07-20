/**
 * Der Redaktionsplan — DIE eine Quelle, wann was rausgeht.
 *
 * Zwei getrennte Spuren, damit nichts doppelt wirkt:
 *
 *   group "highlight" — die vier Story-Highlights. KEIN Feed: einmal posten und
 *     ans Profil PINNEN (das „Erklär-Regal", immer sichtbar). Sie stehen neben
 *     dem Feed, nicht drin — Stories tauchen im Raster ohnehin nicht auf.
 *
 *   group "feed" — die Beiträge im Raster (Reels + Karussells), in Reihenfolge.
 *     Regel: nie zweimal dasselbe Thema direkt hintereinander, und jeder Post ein
 *     anderer ANGLE als der davor. Ein Thema darf als Reel UND als Karussell
 *     vorkommen — aber mit Wochen Abstand, als Format-Abwechslung, nie am Stück.
 *
 * Reels laufen `manual` (du postest sie mit Musik — die API kann keine).
 * Highlights ebenfalls `manual` (Posten + Anpinnen macht man in einem Rutsch in
 * der App). Automatisch läuft nur, was im Feed steht und nicht manual ist: die
 * Karussells.
 *
 * Reihenfolge der Angles im Feed:
 *   Erklärung → Einwand → Features → Kasse → Erklärung → Kasse → Features
 * Kein Angle doppelt nebeneinander; Wiederholungen liegen ≥8 Tage auseinander und
 * wechseln das Format (erst Reel, später Karussell).
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
}

export const PLAN: PlanItem[] = [
  /* ── Feed: ein Angle nach dem anderen ─────────────────────────────────────
   * Priorität vorn: der Saison-Rückblick (Wrapped). Das ist der virale Aufhänger
   * — Leute wollen ihren eigenen und laden dafür die App. Deshalb Reel zuerst,
   * Karussell früh danach (mit Abstand und anderem Format).
   */
  { group: "feed", at: "2026-07-20", kind: "reel", slug: "04-saison-rueckblick", title: "Saison-Rückblick (Wrapped)", angle: "Saison-Rückblick", manual: true },
  { group: "feed", at: "2026-07-22", kind: "karussell", slug: "04-vier-fragen", title: "Vier Fragen aus dem Vorstand", angle: "Einwand" },
  { group: "feed", at: "2026-07-24", kind: "reel", slug: "01-so-funktioniert-ein-pact", title: "So funktioniert ein Pact", angle: "Erklärung", manual: true },
  { group: "feed", at: "2026-07-26", kind: "karussell", slug: "05-saison-rueckblick", title: "Saison-Rückblick (Wrapped)", angle: "Saison-Rückblick" },
  { group: "feed", at: "2026-07-28", kind: "reel", slug: "02-was-ihr-festlegen-koennt", title: "Was ihr festlegen könnt", angle: "Features", manual: true },
  { group: "feed", at: "2026-07-30", kind: "karussell", slug: "03-wer-sponsert-euch", title: "Wer sponsert euch", angle: "Mannschaftskasse" },
  { group: "feed", at: "2026-08-02", kind: "karussell", slug: "01-so-funktioniert-ein-pact", title: "So funktioniert ein Pact", angle: "Erklärung" },
  { group: "feed", at: "2026-08-04", kind: "reel", slug: "03-wer-sponsert-euch", title: "Wer sponsert euch", angle: "Mannschaftskasse", manual: true },
  { group: "feed", at: "2026-08-06", kind: "karussell", slug: "02-was-ihr-festlegen-koennt", title: "Was ihr festlegen könnt", angle: "Features" },

  /* ── Highlights: einmal einrichten und anpinnen (Woche 1) ──────────────── */
  { group: "highlight", at: "2026-07-21", kind: "story", slug: "wie-funktioniert-das", title: "Wie funktioniert das", angle: "Erklärung", manual: true },
  { group: "highlight", at: "2026-07-23", kind: "story", slug: "was-kostet-das", title: "Was kostet das", angle: "Preis", manual: true },
  { group: "highlight", at: "2026-07-25", kind: "story", slug: "was-kann-ich-festlegen", title: "Was kann ich festlegen", angle: "Features", manual: true },
  { group: "highlight", at: "2026-07-26", kind: "story", slug: "haeufige-fragen", title: "Häufige Fragen", angle: "Einwand", manual: true }
];
