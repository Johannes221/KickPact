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

/** Tag im Juni (UTC), ab dem der Crawler in die Sommerpause geht. */
const CRAWLER_PAUSE_START_DAY = 16;
/** Tag im Juli (UTC), ab dem der Crawler wieder läuft. */
const CRAWLER_RESUME_DAY = 15;

/**
 * Crawler-spezifisches Pause-Fenster — enger als die Billing-Sommerpause.
 *
 * Während `isSommerpause` (Juni–Juli) für Pledge-/Billing-Pausen gilt, läuft der
 * Crawler länger:
 *  - ANFANG Juni (bis 15.) noch aktiv: Im Amateurfußball laufen Saison-Finale,
 *    Nachhol- und Relegations-/Aufstiegsspiele bis in den Juni. Deren Ergebnisse
 *    werden teils erst Tage später auf fussball.de eingetragen — der Crawler muss
 *    sie noch einsammeln (sonst bleibt z.B. ein Sonntagsspiel ewig auf „—:—").
 *  - 16. Juni – 14. Juli: echte Sommerpause (keine Spiele) → Crawler pausiert.
 *  - Ab MITTE Juli wieder aktiv: die neuen Saison-Spielpläne erscheinen, der
 *    Crawler sammelt die kommenden Spiele (scheduled-Stubs) vor Saisonauftakt.
 *
 * Fenster: [16. Juni, 15. Juli). Override via SOMMERPAUSE_OVERRIDE_DISABLED.
 */
export function isCrawlerSommerpause(date: Date = new Date()): boolean {
  if (process.env.SOMMERPAUSE_OVERRIDE_DISABLED === "true") return false;
  const month = date.getUTCMonth(); // 0-indexed
  const day = date.getUTCDate();
  if (month === SOMMERPAUSE_START_MONTH && day >= CRAWLER_PAUSE_START_DAY) return true; // 16.–30. Juni
  if (month === 6 && day < CRAWLER_RESUME_DAY) return true; // Juli bis 14.
  return false;
}
