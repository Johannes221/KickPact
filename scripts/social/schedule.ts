import { PLAN } from "./plan";

/**
 * Was der Freigabe-Runner (queue.ts) automatisch postet: alles aus dem Plan
 * AUSSER den Reels. Reels laufen `manual` — die postest du selbst mit Musik.
 *
 * Abgeleitet aus plan.ts, damit es nur EINE Quelle für den Kalender gibt. Wer
 * den Plan ändern will, ändert plan.ts.
 *
 * `at` bekommt eine Uhrzeit (18 Uhr): fällig ist ein Eintrag ab diesem Zeitpunkt,
 * solange er noch nicht gepostet ist. Ein verspäteter Lauf holt Verpasstes nach.
 */

export interface ScheduledPost {
  /** Ortszeit Europe/Berlin, "YYYY-MM-DD HH:mm". */
  at: string;
  kind: "reel" | "story" | "karussell";
  slug: string;
}

export const SCHEDULE: ScheduledPost[] = PLAN.filter((p) => !p.manual).map((p) => ({
  at: `${p.at} 18:00`,
  kind: p.kind,
  slug: p.slug
}));
