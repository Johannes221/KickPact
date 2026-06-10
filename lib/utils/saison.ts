/**
 * Saison-Helfer. Deutsche Amateur-Saisons laufen Juli–Juni und werden als
 * 4-stelliger Code geführt (z.B. "2526" = Saison 2025/26, Juli 2025–Juni 2026).
 *
 * Leichtgewichtig (keine schweren Imports) — bewusst getrennt vom Crawler
 * (`lib/crawler/fussballde.ts` zieht playwright), damit Query-/App-Layer den
 * Helper nutzen können, ohne den Crawler zu importieren.
 */

/**
 * Start-Datum (1. Juli, lokale Zeit) einer Saison aus dem 4-stelligen Code.
 * "2526" → 2025-07-01. `null` bei ungültigem Code.
 */
export function saisonStartDate(saison: string): Date | null {
  const m = saison.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const startYear = 2000 + parseInt(m[1], 10);
  return new Date(startYear, 6, 1); // Monat 6 = Juli (0-indexiert)
}

/**
 * Lesbares Saison-Label für Rechnungen/UI. Akzeptiert beide gespeicherten
 * Formate ("2526" und "2025/26") sowie null (Charge ohne Saison-Angabe).
 * "2526" → "Saison 2025/26".
 */
export function formatSaisonLabel(saison: string | null | undefined): string {
  if (!saison) return "Saison";
  const compact = saison.replace("/", "");
  if (/^\d{4}$/.test(compact)) {
    return `Saison 20${compact.slice(0, 2)}/${compact.slice(2, 4)}`;
  }
  if (/^\d{8}$/.test(compact)) {
    return `Saison ${compact.slice(0, 4)}/${compact.slice(6, 8)}`;
  }
  return `Saison ${saison}`;
}
