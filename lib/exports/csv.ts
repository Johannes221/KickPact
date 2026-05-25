/**
 * Minimal-CSV-Builder für deutsche Excel-Kompatibilität.
 *
 * - Separator: `;` (deutsche Locale; Excel-DE erwartet das).
 * - BOM (`﻿`) am Anfang, damit Excel UTF-8-Umlaute korrekt anzeigt.
 * - Werte werden in doppelte Anführungszeichen gewrappt wenn sie `;`, `"`,
 *   Newline oder Leading/Trailing-Whitespace enthalten. Inner-`"` werden
 *   verdoppelt (RFC 4180).
 * - `null`/`undefined` → leerer String.
 * - `Date` → ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`); Caller kann vorformatieren.
 * - `number` → JS `String(n)` (Punkt als Dezimaltrenner). Caller, der
 *   deutsche Komma-Locale möchte, soll vorher in String konvertieren.
 *
 * Diese Helpers sind pure (kein DB, kein I/O) und werden direkt getestet.
 */

export type CsvCell = string | number | boolean | Date | null | undefined;

export interface CsvBuildOptions {
  /** Header-Zeile, in der gleichen Reihenfolge wie die Row-Cells. */
  headers: string[];
  /** Datenrows; jede Row muss dieselbe Spalten-Reihenfolge wie `headers` haben. */
  rows: CsvCell[][];
  /** Default `;`. */
  separator?: string;
  /** Default `true`. UTF-8 BOM voranstellen. */
  bom?: boolean;
}

/**
 * Escaped einen einzelnen Wert für CSV.
 */
export function csvEscape(value: CsvCell, separator: string = ";"): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "boolean") s = value ? "true" : "false";
  else s = String(value);

  const needsQuoting =
    s.includes(separator) ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r") ||
    s.startsWith(" ") ||
    s.endsWith(" ");
  if (!needsQuoting) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Baut den vollständigen CSV-Body (inkl. optionalem BOM + Header).
 * Newline ist `\r\n` (RFC 4180; Excel-freundlich).
 */
export function buildCsv(opts: CsvBuildOptions): string {
  const sep = opts.separator ?? ";";
  const bom = opts.bom !== false ? "﻿" : "";

  const headerLine = opts.headers.map((h) => csvEscape(h, sep)).join(sep);
  const lines = [headerLine];
  for (const row of opts.rows) {
    lines.push(row.map((c) => csvEscape(c, sep)).join(sep));
  }
  return bom + lines.join("\r\n") + "\r\n";
}

/**
 * Generiert einen safen Filename für CSV-Downloads (kein Path-Traversal,
 * kein Whitespace-Chaos). Pattern: `<base>_<YYYY-MM-DD>.csv`.
 */
export function csvFilename(base: string, date: Date = new Date()): string {
  const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "export";
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${safeBase}_${iso}.csv`;
}

/**
 * Baut die HTTP-Headers für eine CSV-Download-Response (Content-Disposition +
 * Content-Type). Nutzt RFC 5987 `filename*` für UTF-8-Filenames.
 */
export function csvResponseHeaders(filename: string): Record<string, string> {
  const safe = filename.replace(/"/g, "");
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
    // Keine Edge/CDN-Caching: Export-Daten sind oft user-spezifisch + frisch.
    "Cache-Control": "no-store"
  };
}
