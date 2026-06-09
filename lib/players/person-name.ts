import { isReadableName } from "./readable-name";

/**
 * Spielernamen-Normalisierung & -Klassifikation. Single source of truth für
 * Pool-Query, Scraper-Guard und das Cleanup-Skript.
 *
 * Hintergrund: fussball.de-Linktexte verschmutzen den Spieler-Pool mit
 *  - Match-Bericht-Überschriften ("FG Union Heidelberg feiert Sieg …",
 *    "Keine Tore in Schönau", "Sprecakovic glänzt als dreifacher Torschütze"),
 *  - Gegner-Spielern mit Suffix "(Fremdverein) Spieler",
 *  - obfuskierten Tofu-Namen (Private-Use-Area-Font).
 */

/**
 * Strippt das fussball.de-Suffix "(Verein) Spieler" bzw. " Spieler" vom
 * Linktext, sodass nur der reine Personenname übrig bleibt.
 */
export function cleanPlayerName(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/\s*\([^)]*\)\s*Spieler\s*$/u, "")
    .replace(/\s+Spieler\s*$/u, "")
    .trim();
}

/** Extrahiert den Verein aus einem "(Verein) Spieler"-Suffix, falls vorhanden. */
export function extractSuffixClub(raw: string | null | undefined): string | null {
  const m = (raw ?? "").match(/\(([^)]*)\)\s*Spieler\s*$/u);
  return m ? m[1].trim() : null;
}

// Starke Signalwörter für Match-Bericht-Überschriften (kleingeschrieben).
const HEADLINE_RE =
  /(\bsieg\b|siegt|verlier|verlor|gewinn|feiert|glänz|torsch[üu]tz|tore am|keine tore|absteig|aufsteig|spitzenspiel|verdient\b|niederlage|remis|unentschieden|punkt(e|et)\b|am laufenden band|auf dem |patz|souver[äa]n|deklassier|kantersieg|heimsieg|ausw[äa]rtssieg|derby|schie[ßs]t|trifft|klar und|chancenlos|\bast\b)/i;

/**
 * Heuristik: Ist `raw` plausibel ein echter Personenname (Spieler) — KEINE
 * Match-Überschrift, kein Vereins-/Ergebnis-Fragment, kein Tofu?
 *
 * Das Suffix "(Verein) Spieler" wird vorab gestrippt; die Vereins-Zugehörigkeit
 * (eigene vs. fremde Mannschaft) prüft der Aufrufer separat.
 */
export function isLikelyPlayerName(raw: string | null | undefined): boolean {
  const name = cleanPlayerName(raw);
  if (!name) return false;
  if (!isReadableName(name)) return false; // obfuskiertes Tofu
  // Ziffern/Slashes → Vereins-/Staffel-Fragment ("SC 2", "Schönau 1/Altneudorf 1").
  if (/[0-9/]/.test(name)) return false;
  const words = name.split(/\s+/).filter(Boolean);
  // Personen haben 1–4 (selten 5) Namensteile; längere Strings sind Sätze.
  if (words.length > 5) return false;
  if (HEADLINE_RE.test(name)) return false;
  return true;
}

// Generische Vereins-/Kategorie-Tokens, die NICHT zur Unterscheidung taugen
// (Stadt-Tokens bleiben drin — sie sind oft das einzige distinktive Merkmal).
const GENERIC_CLUB_TOKENS = new Set([
  "sv", "fc", "fg", "vfr", "vfb", "tsv", "tsg", "sg", "spvgg", "fsv", "vfl",
  "djk", "sc", "sk", "tv", "tus", "spg", "jsg", "sgm", "ka", "ev", "verein",
  "herren", "damen", "frauen", "junioren", "jugend", "mannschaft", "spieler"
]);

/** Distinktive (nicht-generische) Tokens eines Vereinsnamens. */
function clubTokens(name: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)) {
    if (t.length >= 4 && !/^\d+$/.test(t) && !GENERIC_CLUB_TOKENS.has(t)) {
      out.add(t);
    }
  }
  return out;
}

/**
 * Gehört der Verein aus einem "(Verein) Spieler"-Suffix zur EIGENEN Mannschaft?
 *
 * Strikt über EXAKTE Token (kein Substring) — sonst matcht "Heidelberger SC"
 * fälschlich auf "FG Union Heidelberg" via gemeinsames Stadt-Fragment. Regel:
 * ALLE distinktiven Tokens des eigenen Vereinsnamens müssen im Suffix-Verein
 * vorkommen. `ownClubName` = der Vereinsname (NICHT der Mannschaftsname).
 */
export function suffixClubMatchesOwn(
  suffixClub: string,
  ownClubName: string
): boolean {
  const own = clubTokens(ownClubName);
  if (own.size === 0) return true; // nicht entscheidbar → behalten
  const suf = clubTokens(suffixClub);
  for (const t of own) if (!suf.has(t)) return false;
  return true;
}

/** Normalisierter Schlüssel zum Deduplizieren (Akzent-/Case-insensitiv). */
export function playerDedupKey(raw: string | null | undefined): string {
  return cleanPlayerName(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
