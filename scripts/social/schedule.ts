/**
 * Der Redaktionsplan: was wann rausgeht.
 *
 * DAS ist die Datei, die man anfasst, um den Kalender zu ändern. Der Runner
 * (queue.ts) liest sie, findet die fälligen Einträge und postet sie — nach
 * deiner Freigabe.
 *
 * `at` ist Ortszeit (Europe/Berlin), Format "YYYY-MM-DD HH:mm". Fällig ist ein
 * Eintrag, sobald dieser Zeitpunkt erreicht ist und er noch nicht gepostet
 * wurde. Ein Lauf, der einen Tag zu spät kommt (Rechner war aus), holt ihn nach
 * — besser spät als gar nicht.
 *
 * WAS HIER STEHT und was nicht:
 *   - Reels und Story-Highlights: gehen über die API, stehen also drin.
 *   - Karussells: brauchen R2 (öffentliche Bild-URLs), s. instagram-api.md.
 *     Sobald R2 in der .env.local steht, hier ergänzen — der Runner kann sie
 *     dann auch.
 *
 * Warum diese Reihenfolge: erst der Erklär-Reel (was ist das überhaupt), dann
 * die Highlights zum Anpinnen, dann die vertiefenden Reels. Cadence locker
 * jeden zweiten Tag — bei elf Assets bringt tägliches Feuern nur den Vorrat
 * schneller zum Versiegen.
 */

export interface ScheduledPost {
  /** Ortszeit Europe/Berlin, "YYYY-MM-DD HH:mm". */
  at: string;
  kind: "reel" | "story" | "karussell";
  /** Slug wie in decks.ts / stories.ts / spots.ts. Teil-Match reicht nicht — exakt. */
  slug: string;
}

export const SCHEDULE: ScheduledPost[] = [
  { at: "2026-07-21 18:00", kind: "reel", slug: "01-so-funktioniert-ein-pact" },
  { at: "2026-07-22 12:00", kind: "story", slug: "wie-funktioniert-das" },
  { at: "2026-07-23 18:00", kind: "reel", slug: "02-was-ihr-festlegen-koennt" },
  { at: "2026-07-24 12:00", kind: "story", slug: "was-kostet-das" },
  { at: "2026-07-25 18:00", kind: "reel", slug: "03-wer-sponsert-euch" },
  { at: "2026-07-28 12:00", kind: "story", slug: "was-kann-ich-festlegen" },
  { at: "2026-07-30 12:00", kind: "story", slug: "haeufige-fragen" }
];
