/**
 * Liga-/Spielklassen-Helfer (pure, ohne DB/Browser). Genutzt vom Scraper
 * (`lib/crawler/fussballde.ts`), den Discovery-Queries und der UI.
 */

const WEEKDAY_TOKENS = new Set(["mo", "di", "mi", "do", "fr", "sa", "so"]);

/**
 * Prüft, ob ein Wert eine plausible Liga/Spielklasse ist. Wehrt die Werte ab,
 * die der alte Parser fälschlich als Liga gespeichert hat — vor allem den
 * Wochentag ("So" = Sonntag), aber auch Uhrzeiten, Datumsangaben und reine
 * Wettbewerbs-IDs. Dient zugleich als Defense-in-depth, damit solcher Müll
 * weder gespeichert noch im Filter/Karten-Untertitel angezeigt wird.
 */
export function isPlausibleLeague(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (v.length < 2) return false;
  if (WEEKDAY_TOKENS.has(v.toLowerCase().replace(/\.$/, ""))) return false; // Wochentag
  if (/^\d+$/.test(v)) return false; // reine Wettbewerb-ID
  if (/^\d{1,2}[:.]\d{2}/.test(v)) return false; // Uhrzeit "14:00"
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(v)) return false; // Datum
  return true;
}
