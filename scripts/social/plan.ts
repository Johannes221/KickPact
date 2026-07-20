/**
 * Der Redaktionsplan — DIE eine Quelle, wann was rausgeht.
 *
 * Daraus ergeben sich zwei Dinge, damit nichts auseinanderläuft:
 *   - schedule.ts: die AUTOMATISCH geposteten Stücke (alles außer Reels) für den
 *     Freigabe-Runner (queue.ts).
 *   - postmappe.ts: der durchnummerierte Ordner zum Durchklicken (alle Stücke).
 *
 * Reels laufen `manual: true` — die postest du selbst aus der App mit Musik (die
 * API kann keine Musik, und bei Reels zählt sie). Stories und Karussells laufen
 * automatisch.
 *
 * Samstage sind bewusst leer (alle sind am Platz). Reihenfolge: erst der Einstieg
 * „was ist ein Pact", dann abwechselnd erklären / zeigen / Einwände.
 */

export interface PlanItem {
  /** Ortszeit-Datum "YYYY-MM-DD". */
  at: string;
  kind: "reel" | "story" | "karussell";
  /** Slug wie in spots.ts / stories.ts / decks.ts. */
  slug: string;
  /** Klartext-Titel für die Übersicht. */
  title: string;
  /** true = du postest von Hand (mit Musik). Nur Reels. */
  manual?: boolean;
}

export const PLAN: PlanItem[] = [
  { at: "2026-07-20", kind: "reel", slug: "01-so-funktioniert-ein-pact", title: "So funktioniert ein Pact", manual: true },
  { at: "2026-07-21", kind: "story", slug: "wie-funktioniert-das", title: "Highlight: Wie funktioniert das" },
  { at: "2026-07-22", kind: "karussell", slug: "01-so-funktioniert-ein-pact", title: "So funktioniert ein Pact" },
  { at: "2026-07-23", kind: "reel", slug: "02-was-ihr-festlegen-koennt", title: "Was ihr festlegen könnt", manual: true },
  { at: "2026-07-24", kind: "story", slug: "was-kostet-das", title: "Highlight: Was kostet das" },
  { at: "2026-07-26", kind: "karussell", slug: "03-wer-sponsert-euch", title: "Wer sponsert euch" },
  { at: "2026-07-27", kind: "karussell", slug: "02-was-ihr-festlegen-koennt", title: "Was ihr festlegen könnt" },
  { at: "2026-07-28", kind: "reel", slug: "03-wer-sponsert-euch", title: "Wer sponsert euch", manual: true },
  { at: "2026-07-29", kind: "story", slug: "was-kann-ich-festlegen", title: "Highlight: Was kann ich festlegen" },
  { at: "2026-07-31", kind: "karussell", slug: "04-vier-fragen", title: "Vier Fragen aus dem Vorstand" },
  { at: "2026-08-02", kind: "story", slug: "haeufige-fragen", title: "Highlight: Häufige Fragen" }
];
