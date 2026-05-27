/**
 * Sommerpause-Hilfsfunktionen für KickPact.
 *
 * Im deutschen Amateurfußball gibt es typischerweise eine Sommerpause von
 * Anfang Juni bis Ende Juli. Die KickPact-Crons folgen diesem Rhythmus:
 *
 *   1. Juni  02:00 UTC → Sommerpause-Start  (Crawler pausiert, Pledges pausieren)
 *   1. August 02:00 UTC → Sommerpause-Ende  (Crawler läuft wieder, Pledges reaktivieren)
 *
 * Das Fenster kann via SOMMERPAUSE_OVERRIDE_DISABLED=true Env-Var deaktiviert
 * werden — nützlich für Integrations-Tests und manuelle Re-Runs.
 */

/** Month index (0-based): June = 5, August = 7. */
const SOMMERPAUSE_START_MONTH = 5; // June
const SOMMERPAUSE_END_MONTH = 7;   // August (exclusive — resumes 1.8.)

/**
 * Returns true when the given date (default: now) falls within the Sommerpause
 * window [June 1, August 1).
 *
 * Can be overridden by setting SOMMERPAUSE_OVERRIDE_DISABLED=true in the env,
 * which always returns false (useful for CI / manual crawler runs in summer).
 */
export function isSommerpause(date: Date = new Date()): boolean {
  if (process.env.SOMMERPAUSE_OVERRIDE_DISABLED === "true") return false;
  const month = date.getUTCMonth(); // 0-indexed
  return month >= SOMMERPAUSE_START_MONTH && month < SOMMERPAUSE_END_MONTH;
}
