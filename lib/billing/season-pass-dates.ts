/**
 * Pure Date-Helpers für den Saison-Pass-Lifecycle. Kein DB-Import → testbar.
 */

/**
 * Berechnet den nächsten 1.8. ab `now` (UTC). Wenn `now` selbst der 1.8. oder
 * später im Jahr ist, ist es der 1.8. des Folgejahres.
 */
export function nextAugustFirst(now: Date): Date {
  const year =
    now.getUTCMonth() > 7 ||
    (now.getUTCMonth() === 7 && now.getUTCDate() >= 1)
      ? now.getUTCFullYear() + 1
      : now.getUTCFullYear();
  return new Date(Date.UTC(year, 7, 1, 0, 0, 0, 0));
}
