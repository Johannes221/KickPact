/**
 * Pure-Helper für den „Spiele werden geladen"-Status einer Mannschaft.
 *
 * Eine Mannschaft gilt als „crawling", solange:
 *   1. crawlStartedAt gesetzt ist, UND
 *   2. crawlCompletedAt entweder NULL ist oder VOR dem Start liegt (also der
 *      letzte Start noch nicht abgeschlossen wurde), UND
 *   3. der Start jünger als CRAWL_STALE_MS ist — Stale-Guard, damit ein
 *      abgestürzter/hängender Crawler-Job das Banner nicht ewig anzeigt.
 *
 * Bewusst seiteneffektfrei + zeit-injizierbar, damit es ohne DB/Clock testbar ist.
 */
export const CRAWL_STALE_MS = 10 * 60 * 1000; // 10 Minuten

export function isTeamCrawling(
  crawlStartedAt: Date | null,
  crawlCompletedAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!crawlStartedAt) return false;
  const started = crawlStartedAt.getTime();
  // Abgeschlossen (completed liegt am/nach dem Start) → nicht mehr crawling.
  if (crawlCompletedAt && crawlCompletedAt.getTime() >= started) return false;
  // Stale-Guard: zu alter Start zählt nicht mehr als „läuft gerade".
  return now.getTime() - started < CRAWL_STALE_MS;
}
