/**
 * Kanonische EUR-Format-Helper (de-DE). Ersetzt die zuvor ~40 lokalen
 * `function eur(...)`-Kopien quer durch app/, components/ und lib/.
 *
 * Alle Helper nehmen CENTS (Integer) — wie überall im Datenmodell.
 */

/** `123456` → `"1.234,56 €"` (de-DE, non-breaking space vor €). */
export function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

/** Wie `eur`, aber ohne €-Zeichen: `123456` → `"1.234,56"`. */
export function eurNoSign(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Wie `eur`, aber `null`/`undefined` → `"—"` (Tabellen-Platzhalter). */
export function eurOrDash(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return eur(cents);
}

/**
 * CSV-/Excel-DE-Variante: Komma als Dezimaltrenner, KEINE Tausenderpunkte
 * (Punkte würden je nach Excel-Setting als Tausender/Dezimal kollidieren).
 * `null`/`undefined` → leerer String (leere Zelle).
 */
export function eurCsv(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
