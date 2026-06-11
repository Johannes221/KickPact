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
 * Leitet die aktuelle Saison aus dem Datum ab (default: jetzt).
 * Deutsche Amateur-Saisons laufen Aug → Jun; Stichtag ist der 1. Juli:
 *   Mai 2026 → Saison 25/26 → "2526"
 *   Sep 2026 → Saison 26/27 → "2627"
 */
export function currentSaisonCode(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const startYear = month >= 7 ? year : year - 1;
  return String(startYear).slice(-2) + String(startYear + 1).slice(-2);
}

/** Normalisiert "2526" oder "25/26" auf das Start-Jahr (2-stellig) oder null. */
function parseSaisonCode(code: string): number | null {
  const compact = code.replace("/", "");
  const m = compact.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/** Nachfolge-Saison: "2526" → "2627". `null` bei ungültigem Code. */
export function nextSaisonCode(code: string): string | null {
  const lo = parseSaisonCode(code);
  if (lo === null) return null;
  const nextLo = (lo + 1) % 100;
  const nextHi = (lo + 2) % 100;
  return (
    String(nextLo).padStart(2, "0") + String(nextHi).padStart(2, "0")
  );
}

/** Vorgänger-Saison: "2627" → "2526". `null` bei ungültigem Code. */
export function prevSaisonCode(code: string): string | null {
  const lo = parseSaisonCode(code);
  if (lo === null) return null;
  const prevLo = (lo + 99) % 100;
  return String(prevLo).padStart(2, "0") + String(lo).padStart(2, "0");
}

/** Kurzes UI-Label: "2526" → "25/26". Ungültige Codes unverändert zurück. */
export function saisonLabel(code: string): string {
  const m = code.match(/^(\d{2})(\d{2})$/);
  if (!m) return code;
  return `${m[1]}/${m[2]}`;
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
