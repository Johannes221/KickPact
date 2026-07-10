/**
 * Zentrale Datums-Formatierung mit FESTER Zeitzone (Europe/Berlin) + Locale.
 *
 * Ohne feste `timeZone` rendert der Server (Container-TZ=UTC) den UTC-Kalendertag,
 * der Browser (Berlin) den lokalen — für Zeitstempel zwischen ~22:00–24:00 UTC
 * ist das ein anderer Tag → (a) falscher Tag für den deutschen Nutzer und
 * (b) in Client-Komponenten ein SSR-vs-Browser-Hydration-Mismatch (#418, nur
 * Safari/prod sichtbar). Immer diese Helfer statt roher toLocaleDateString-Aufrufe.
 */
const TZ = "Europe/Berlin";
const LOCALE = "de-DE";

/** Kalendertag, z.B. „5. Juli 2026". `opts` überschreibt die Default-Felder. */
export function formatDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }
): string {
  return new Date(date).toLocaleDateString(LOCALE, { timeZone: TZ, ...opts });
}

/** Kurzdatum „05.07.2026". */
export function formatDateShort(date: Date | string | number): string {
  return formatDate(date, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Datum + Uhrzeit, z.B. „05.07.2026, 21:30". */
export function formatDateTime(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }
): string {
  return new Date(date).toLocaleString(LOCALE, { timeZone: TZ, ...opts });
}
