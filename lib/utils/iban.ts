/**
 * IBAN-Validierung mit ISO-7064 Mod-97-10-Prüfsumme (kein Dependency nötig).
 *
 * Warum: Die IBAN des Vereins landet als Zahlungsziel auf JEDER Sponsor-
 * Zahlungsübersicht (+ Girocode-QR). Eine kaputte IBAN = Überweisungen ins
 * Leere. Reine Längen-Checks (15–34) reichen dafür nicht — ein Tippfehler in
 * der Prüfziffer rutscht sonst durch (QA-Fund 2026-07).
 */

/** Normalisiert: Leerzeichen weg, Großbuchstaben. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * True, wenn die IBAN strukturell gültig ist UND die Mod-97-Prüfsumme stimmt.
 * Akzeptiert IBANs mit/ohne Leerzeichen. Prüft NICHT die landesspezifische
 * Länge (die variiert je Land) — nur Format + Prüfziffer, das fängt Tippfehler.
 */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  // Format: 2 Buchstaben (Ländercode) + 2 Ziffern (Prüfziffer) + 11–30 alnum.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Umstellen: erste 4 Zeichen ans Ende, dann Buchstaben → Zahlen (A=10…Z=35).
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}
