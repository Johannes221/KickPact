/**
 * Entscheidet, ob ein beim Crawl finalisiertes Spiel als „Update" (Korrektur)
 * oder als erstmaliges Ergebnis gilt — steuert das `updated`-Flag im
 * `match/finished`-Event und damit, ob `notify-match-result` den Ergebnis-Push
 * feuert.
 *
 * Ein `scheduled`-Stub (via `upsertScheduledMatch` aus `next.games`) hat
 * `contentHash === null`. Seine erste Finalisierung mit echtem Ergebnis ist KEIN
 * Update, sondern das erste Ergebnis überhaupt → Push muss feuern (`updated:
 * false`). Nur die Nachkorrektur eines schon fertigen Spiels (contentHash bereits
 * gesetzt) ist ein echtes Update → still (`updated: true`), damit Sponsoren/
 * Mitglieder nicht bei jedem Re-Crawl erneut gepingt werden.
 *
 * Vor diesem Helper wurde im Update-Zweig hart `updated: true` gesendet — womit
 * der Normalfall (Spiel erst als Stub gesehen, dann finalisiert) NIE einen
 * Ergebnis-Push auslöste.
 */
export function isResultCorrection(existingContentHash: string | null): boolean {
  return existingContentHash !== null;
}
