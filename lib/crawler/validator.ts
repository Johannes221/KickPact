/**
 * Sanity-check layer for scraped fussball.de data.
 *
 * Called BEFORE any scraped match is written to the DB. Each check returns
 * { valid: false, reason } on failure so callers can log exactly what was
 * rejected without silently dropping data.
 *
 * Rule philosophy:
 * - Be lenient on what is acceptable (amateur football can have 12:0 scorelines)
 * - Be strict on what is clearly a scraping artifact (empty names, null scores,
 *   future dates, impossible half-time > full-time, wildly implausible numbers)
 */

import type { SpielListItem, SpielDetails } from "./fussballde";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// SpielListItem — the lightweight list entry returned by getSpiele()
// ---------------------------------------------------------------------------

export function validateSpielListItem(s: SpielListItem): ValidationResult {
  // spielId must be non-empty, alphanumeric, ≥6 chars (fussball.de format)
  if (!s.spielId || !/^[A-Z0-9]{6,}$/i.test(s.spielId.trim())) {
    return { valid: false, reason: `spielId ungültig: "${s.spielId}"` };
  }

  // datum must be DD.MM.YYYY
  if (!s.datum || !/^\d{2}\.\d{2}\.\d{4}$/.test(s.datum)) {
    return { valid: false, reason: `datum Format ungültig: "${s.datum}"` };
  }

  // datum must be a real calendar date
  const [dd, mm, yyyy] = s.datum.split(".");
  const matchDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
  if (isNaN(matchDate.getTime())) {
    return { valid: false, reason: `datum kein gültiges Datum: "${s.datum}"` };
  }

  // Must be in the past (only "vergangene Spiele" should be listed)
  if (matchDate > new Date()) {
    return { valid: false, reason: `Spiel liegt in der Zukunft: "${s.datum}"` };
  }

  // Not more than 4 seasons ago — catches stale scraping artifacts
  const fourYearsAgo = new Date();
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
  if (matchDate < fourYearsAgo) {
    return { valid: false, reason: `Spiel zu alt (>4 Jahre): "${s.datum}"` };
  }

  // Both team names must look like real club names
  const heimCheck = validateTeamName(s.heim, "Heim");
  if (!heimCheck.valid) return heimCheck;
  const gastCheck = validateTeamName(s.gast, "Gast");
  if (!gastCheck.valid) return gastCheck;

  // URL must point to fussball.de
  if (s.url && !s.url.includes("fussball.de")) {
    return { valid: false, reason: `URL unplausibel: "${s.url}"` };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// SpielDetails — the full match result returned by getSpielDetails()
// ---------------------------------------------------------------------------

export function validateSpielDetails(d: SpielDetails): ValidationResult {
  const heimCheck = validateTeamName(d.heim, "Heim");
  if (!heimCheck.valid) return heimCheck;
  const gastCheck = validateTeamName(d.gast, "Gast");
  if (!gastCheck.valid) return gastCheck;

  // Endstand nicht belegt: Obfuscation-Font war nicht dekodierbar UND es gab
  // keine Tor-Events. Das von getSpielDetails zurückgegebene 0:0 ist geraten,
  // kein reales Ergebnis (results_only-Team ohne Score-Font, oder eine Block-/
  // Interstitial-Seite die den fetchHtml-Guard passierte). Nicht als gespieltes
  // Match persistieren — sonst fehlen echte Charges bzw. feuert fälschlich eine
  // Zu-Null-/Unentschieden-Wette. Ein ECHT dekodiertes 0:0 hat resultReliable
  // !== false und bleibt gültig.
  if (d.resultReliable === false) {
    return {
      valid: false,
      reason: "Endstand nicht verlässlich ermittelbar (Score-Font nicht dekodierbar, keine Tor-Events) — als Scrape-Fehler behandelt"
    };
  }

  // Scores must be non-negative integers
  if (!Number.isInteger(d.ergebnis.heim) || d.ergebnis.heim < 0) {
    return { valid: false, reason: `Ergebnis Heim kein gültiger Wert: ${d.ergebnis.heim}` };
  }
  if (!Number.isInteger(d.ergebnis.gast) || d.ergebnis.gast < 0) {
    return { valid: false, reason: `Ergebnis Gast kein gültiger Wert: ${d.ergebnis.gast}` };
  }

  // Upper bound: generous for amateur football (10:0 is real; 40:0 is a scraping bug)
  const MAX_SINGLE = 25;
  const MAX_TOTAL = 35;
  if (d.ergebnis.heim > MAX_SINGLE) {
    return {
      valid: false,
      reason: `Ergebnis Heim unplausibel hoch: ${d.ergebnis.heim} (max ${MAX_SINGLE})`
    };
  }
  if (d.ergebnis.gast > MAX_SINGLE) {
    return {
      valid: false,
      reason: `Ergebnis Gast unplausibel hoch: ${d.ergebnis.gast} (max ${MAX_SINGLE})`
    };
  }
  if (d.ergebnis.heim + d.ergebnis.gast > MAX_TOTAL) {
    return {
      valid: false,
      reason: `Gesamttore unplausibel: ${d.ergebnis.heim}:${d.ergebnis.gast} (max ${MAX_TOTAL} gesamt)`
    };
  }

  // Halbzeit-Konsistenz: Halbzeit-Tore dürfen nicht mehr sein als Endergebnis
  if (d.halbzeit) {
    if (d.halbzeit.heim > d.ergebnis.heim) {
      return {
        valid: false,
        reason: `HZ Heim ${d.halbzeit.heim} > Endergebnis Heim ${d.ergebnis.heim}`
      };
    }
    if (d.halbzeit.gast > d.ergebnis.gast) {
      return {
        valid: false,
        reason: `HZ Gast ${d.halbzeit.gast} > Endergebnis Gast ${d.ergebnis.gast}`
      };
    }
    // Halbzeit-Tore ebenfalls auf MAX_SINGLE begrenzen
    if (d.halbzeit.heim > MAX_SINGLE || d.halbzeit.gast > MAX_SINGLE) {
      return {
        valid: false,
        reason: `Halbzeitergebnis unplausibel: ${d.halbzeit.heim}:${d.halbzeit.gast}`
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A valid team name must:
 * - Be non-empty after trimming
 * - Be 2–100 characters long
 * - Contain at least one letter (rules out scraped numbers / HTML fragments)
 * - Not be a known placeholder/garbage value
 */
function validateTeamName(name: string, label: string): ValidationResult {
  const trimmed = (name ?? "").trim();

  if (trimmed.length < 2) {
    return { valid: false, reason: `${label}team zu kurz: "${name}"` };
  }
  if (trimmed.length > 100) {
    return { valid: false, reason: `${label}team zu lang (>${100} Zeichen): "${name.slice(0, 40)}…"` };
  }
  if (!/[a-zA-ZäöüÄÖÜß]/.test(trimmed)) {
    return { valid: false, reason: `${label}team enthält keine Buchstaben: "${name}"` };
  }

  // Obvious HTML artifacts or placeholders
  const lc = trimmed.toLowerCase();
  const junkPatterns = ["undefined", "null", "n/a", "<", ">", "javascript:", "http"];
  for (const p of junkPatterns) {
    if (lc.includes(p)) {
      return { valid: false, reason: `${label}team sieht aus wie HTML-Artefakt: "${name}"` };
    }
  }

  return { valid: true };
}
