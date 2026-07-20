import { PLAN } from "./plan";

/**
 * Was der Freigabe-Runner (queue.ts) automatisch postet: die Feed-Beiträge, die
 * nicht `manual` sind — also die Karussells. Reels (Musik) und Story-Highlights
 * (Anpinnen) machst du von Hand.
 *
 * Abgeleitet aus plan.ts, damit es nur EINE Quelle für den Kalender gibt. Wer
 * den Plan ändert, ändert plan.ts.
 */

export interface ScheduledPost {
  /** Ortszeit Europe/Berlin, "YYYY-MM-DD HH:mm". */
  at: string;
  kind: "reel" | "story" | "karussell";
  slug: string;
}

export const SCHEDULE: ScheduledPost[] = PLAN.filter(
  (p) => p.group === "feed" && !p.manual
).map((p) => ({ at: `${p.at} 18:00`, kind: p.kind, slug: p.slug }));
