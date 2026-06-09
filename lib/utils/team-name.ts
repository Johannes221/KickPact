/**
 * Kürzt einen fussball.de-Vereinsnamen auf eine kompakte, wiedererkennbare
 * Form — gedacht für dichte Listen (Spiele-Liste auf Mobile), wo lange Namen
 * wie „SV Friesland 08" oder „TuS Einheit Wilhelmshaven" sonst abgeschnitten
 * werden.
 *
 * Strategie: Vereins-Präfix (SV / TuS / SKV / FC …) + erstes signifikantes Wort
 * behalten, Jahreszahlen / Rechtsform / Füllwörter weglassen.
 *
 *   „SV Friesland 08"             → „SV Friesland"
 *   „TuS Einheit Wilhelmshaven"   → „TuS Einheit"
 *   „1. FC Köln"                  → „FC Köln"
 *   „SKV Rot-Weiß Wilhelmshaven"  → „SKV Rot-Weiß"
 *
 * Bewusst KEINE reine Initial-Abkürzung (SVF / TUSE): die wäre noch kürzer,
 * aber bei mehreren gleichnamigen Präfixen in einer Liste mehrdeutig. Diese
 * Form halbiert die Länge und bleibt lesbar.
 */
const LEGAL_SUFFIX = /\b(e\.?\s?V\.?|gGmbH|GmbH|mbH)\b/gi;
const STOPWORDS = new Set([
  "von",
  "der",
  "die",
  "das",
  "und",
  "am",
  "im",
  "an",
  "zu",
  "de",
  "la"
]);

export function abbreviateTeamName(raw: string): string {
  if (!raw) return raw;

  // 1. Rechtsform-Suffixe raus, Whitespace normalisieren.
  const cleaned = raw.replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();

  // 2. Tokenisieren, reine Zahlen-Tokens (Gründungsjahr „08", „1900", „1.")
  //    entfernen — sie tragen nichts zur Wiedererkennung bei.
  const allWords = cleaned.split(" ").filter(Boolean);
  const withoutNumbers = allWords.filter((w) => !/^\d+\.?$/.test(w));
  const words = withoutNumbers.length ? withoutNumbers : allWords;

  // 3. Füllwörter rausfiltern (aber nie alles wegfiltern).
  const significant = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const tokens = significant.length ? significant : words;

  if (tokens.length <= 1) return tokens[0] ?? cleaned;

  // 4. Präfix + erstes signifikantes Wort. Bei sehr kurzem zweiten Token
  //    (röm. Mannschafts-Suffix „II"/„III" o.Ä.) ggf. noch ein drittes mitnehmen.
  const prefix = tokens[0];
  const second = tokens[1];
  if (/^[IVX]+$/i.test(second) && tokens[2]) {
    return `${prefix} ${tokens[2]}`;
  }
  return `${prefix} ${second}`;
}

/**
 * Harte Initial-Abkürzung für sehr enge Stellen (Score-Header auf Mobile, wo
 * Heim/Gast je nur eine schmale Spalte neben dem mittigen Ergebnis haben).
 * Anders als {@link abbreviateTeamName} (lesbare Halb-Kürzung) erzeugt diese
 * Funktion ein Scoreboard-Kürzel — wie „BVB", „FCB" oder „SVS":
 *
 *   „SV Schwetzingen"             → „SVS"
 *   „FC Sportfreunde Dossenheim"  → „FCSD"
 *   „1. FC Köln"                  → „FCK"
 *   „Heidelberger SC"             → „HSC"
 *   „FG Union Heidelberg"         → „FGUH"
 *
 * Bereits großgeschriebene Präfix-Kürzel (SV, FC, TSV, SKV …) bleiben als Block
 * erhalten; alle übrigen signifikanten Wörter steuern ihren Anfangsbuchstaben
 * bei. Jahreszahlen, Rechtsform und Füllwörter fallen weg. Der volle Name muss
 * an der Aufrufstelle als `title`/Label sichtbar bleiben — das Kürzel allein ist
 * für Eingeweihte gedacht, nicht selbsterklärend.
 */
export function acronymTeamName(raw: string): string {
  if (!raw) return raw;

  const cleaned = raw.replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();
  const words = cleaned
    .split(" ")
    .filter(Boolean)
    .filter((w) => /[A-Za-zÄÖÜäöü]/.test(w)) // reine Satzzeichen/Reste (z.B. „.") raus
    .filter((w) => !/^\d+\.?$/.test(w)) // Gründungsjahre / „1." raus
    .filter((w) => !STOPWORDS.has(w.toLowerCase()));

  if (words.length === 0) return cleaned;
  if (words.length === 1) {
    // Einzelwort: schon ein Kürzel? behalten. Sonst auf 4 Zeichen kappen.
    const w = words[0];
    return /^[A-ZÄÖÜ]{2,5}$/.test(w) ? w : w.slice(0, 4);
  }

  const acr = words
    .map((w) => (/^[A-ZÄÖÜ]{2,4}$/.test(w) ? w : (w[0] ?? "").toUpperCase()))
    .join("");

  // Sehr lange Ketten (4+ Wörter) auf 6 Zeichen begrenzen.
  return acr.length > 6 ? acr.slice(0, 6) : acr;
}
