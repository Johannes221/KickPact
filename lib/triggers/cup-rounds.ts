/**
 * Pokal-Runden — kanonische Keys + Labels, single source of truth.
 *
 * Dieselben Keys werden an drei Stellen gebraucht und MÜSSEN übereinstimmen,
 * sonst feuert der `season_cup_round`-Trigger nie:
 *  1. Verein trägt die erreichte Runde ein → `season_results.cup_round_reached`.
 *  2. Sponsor wählt die Ziel-Runde im Pact → Trigger-Param `minRound`.
 *  3. `evaluate-season.ts` vergleicht beide über die Reihenfolge dieser Liste.
 *
 * Reihenfolge ist aufsteigend (früh → spät). Der Trigger feuert, wenn die
 * erreichte Runde >= der gewählten Ziel-Runde liegt.
 */
export const CUP_ROUND_ORDER = [
  "vorrunde",
  "1.runde",
  "2.runde",
  "achtelfinale",
  "viertelfinale",
  "halbfinale",
  "finale",
  "sieger"
] as const;

export type CupRound = (typeof CUP_ROUND_ORDER)[number];

export const CUP_ROUND_LABELS: Record<CupRound, string> = {
  vorrunde: "Vorrunde",
  "1.runde": "1. Runde",
  "2.runde": "2. Runde",
  achtelfinale: "Achtelfinale",
  viertelfinale: "Viertelfinale",
  halbfinale: "Halbfinale",
  finale: "Finale",
  sieger: "Sieger"
};

/** Rang einer Runde (0 = früheste). -1 wenn unbekannt. Lowercased-Vergleich. */
export function cupRoundRank(round: string | null | undefined): number {
  if (!round) return -1;
  return (CUP_ROUND_ORDER as readonly string[]).indexOf(round.toLowerCase());
}
