/**
 * fussball.de obfuskiert Spielernamen auf der Live-Kader-Seite mit einem
 * Custom-Font: die echten Buchstaben sind auf Codepoints in der Unicode
 * Private Use Area (U+E000–U+F8FF) gemappt und nur mit deren Font lesbar.
 * Ein unaufgelöster Kader-Scrape liefert daher Müll, der im UI als Tofu-Boxen
 * erscheint. Diese Funktion erkennt solche Namen, damit wir sie aus
 * Dropdown-Listen filtern bzw. beim Persistieren nicht über echte Namen
 * schreiben.
 *
 * Single source of truth — genutzt von der squad-API, der Pool-Query und
 * `persistKader`.
 */
export function isReadableName(name: string): boolean {
  let hasLetter = false;
  for (const ch of name) {
    const cp = ch.codePointAt(0)!;
    // Private Use Area oder Steuerzeichen → obfuskiert/kaputt
    if (cp >= 0xe000 && cp <= 0xf8ff) return false;
    if (cp < 0x20 && cp !== 0x09) return false;
    if (cp === 0xfffd) return false; // Replacement Character
    if (/\p{L}/u.test(ch)) hasLetter = true;
  }
  return hasLetter;
}
