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
