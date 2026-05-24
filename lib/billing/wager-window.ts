/**
 * Saison-Wetten- / Saison-Pass-Cutoff-Logik.
 *
 * Pure Helpers (kein DB-Import) für Vitest-Tests + Server-Action-Guards.
 * Die DB-Wrapper liegen in `lib/billing/wager-window-server.ts`.
 */

/**
 * Typed Error: Saison-Wetten-Window ist geschlossen (nach 5. Spieltag).
 * Server-Actions werfen das; API-Handler konvertieren in 400.
 */
export class WagerWindowClosedError extends Error {
  constructor(
    public seasonCode: string | null,
    public cutoffAt: Date | null
  ) {
    super(
      `Saison-Wetten-Window geschlossen (Saison ${seasonCode ?? "?"}, Cutoff ${
        cutoffAt?.toISOString() ?? "?"
      }).`
    );
    this.name = "WagerWindowClosedError";
  }
}

export interface SeasonWindow {
  /** ID der Saison (für Logs). */
  id: string;
  code: string;
  /** Inklusiver Cutoff: today <= matchdayFiveAt → erlaubt. */
  matchdayFiveAt: Date;
}

/**
 * Pure: true, wenn `today <= matchdayFiveAt`. Inclusive.
 */
export function canBookSeasonPassPure(
  season: SeasonWindow | null,
  today: Date
): boolean {
  if (!season) return false;
  return today.getTime() <= season.matchdayFiveAt.getTime();
}

/**
 * Pure: true, wenn Saison-Wetten noch buchbar sind.
 * Identische Regel wie Saison-Pass (gleicher Cutoff).
 */
export function canCreateSeasonWagerPure(
  season: SeasonWindow | null,
  today: Date
): boolean {
  return canBookSeasonPassPure(season, today);
}

/**
 * Convenience: wirft `WagerWindowClosedError`, wenn nicht erlaubt.
 * Im Pledge-Builder direkt aufrufbar.
 */
export function assertWagerWindowOpen(
  season: SeasonWindow | null,
  today: Date
): void {
  if (!canCreateSeasonWagerPure(season, today)) {
    throw new WagerWindowClosedError(
      season?.code ?? null,
      season?.matchdayFiveAt ?? null
    );
  }
}
