/**
 * Daten-Coverage-Modell — wie weit fußball.de für eine Mannschaft Daten liefert.
 *
 * Hintergrund (Scraper-Probe 2026-06-05, 108 Mannschaften): fußball.de führt
 * benannte Torschützen zuverlässig nur bei Herren (alle Ligen), Frauen sowie A-
 * und B-Jugend. C-/D-Jugend ist gemischt (oft nur Endstand), ab E-Jugend (U10/11)
 * abwärts gibt es gar keine Ergebnisse („Fair-Play-Liga ohne Tabelle").
 *
 * Dieses Modul ist BEWUSST abhängigkeitsarm (nur der reine `TriggerType`-Import) —
 * es wird sowohl server-seitig (Gating der Pact-Erstellung, Crawler, Onboarding)
 * als auch im Client-Builder importiert. KEINE Scraper-/DB-Imports hier.
 */
import type { TriggerType } from "./labels";

/**
 * - `full`         — benannte Torschützen vorhanden → alle Regel-Typen.
 * - `results_only` — nur Endstand → Ergebnis-/Comeback-/Saison-Regeln + manuelle
 *                    Events, KEINE Auto-Spieler-Regeln.
 * - `none`         — keine automatischen Ergebnisse → ALLES läuft manuell
 *                    (Verein meldet Spiele/Ereignisse + Endstand-Override,
 *                    Sponsor bestätigt). Seit Audit 2026-06-11 / Phase 4 im
 *                    Onboarding anlegbar; Trigger-Gating wie results_only.
 */
export type Coverage = "full" | "results_only" | "none";

export const COVERAGE_ORDER: Record<Coverage, number> = {
  none: 0,
  results_only: 1,
  full: 2
};

/** Liefert die höhere (großzügigere) der beiden Coverage-Stufen. */
export function combineCoverage(a: Coverage, b: Coverage): Coverage {
  return COVERAGE_ORDER[a] >= COVERAGE_ORDER[b] ? a : b;
}

export type AgeClass =
  | "herren"
  | "frauen"
  | "alte_herren"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "unbekannt";

/**
 * Leitet die Altersklasse aus dem fußball.de-Mannschaftsnamen ab
 * (z.B. "C-Junioren - SV Waldhof Mannheim", "Herren - …", "U13").
 * Portiert aus `scripts/probe-spielbericht-coverage.ts` (`ageGroup()`).
 */
export function ageClassFromTeamName(name: string): AgeClass {
  const n = name.toLowerCase();
  if (/alte herren|\bah\b|herren ü|\bü\s?\d{2}\b/.test(n)) return "alte_herren";
  if (/bambini|g-?junior|g-?jugend|\bu\s?[67]\b/.test(n)) return "G";
  if (/f-?junior|f-?jugend|\bu\s?[89]\b/.test(n)) return "F";
  if (/e-?junior|e-?jugend|\bu\s?1[01]\b/.test(n)) return "E";
  if (/d-?junior|d-?jugend|\bu\s?1[23]\b/.test(n)) return "D";
  if (/c-?junior|c-?jugend|\bu\s?1[45]\b/.test(n)) return "C";
  if (/b-?junior|b-?jugend|\bu\s?1[67]\b/.test(n)) return "B";
  if (/a-?junior|a-?jugend|\bu\s?1[89]\b/.test(n)) return "A";
  if (/frauen|damen|juniorinnen|mädchen/.test(n)) return "frauen";
  if (/herren|reserve|\bi+\b|\b\d\b/.test(n)) return "herren";
  return "unbekannt";
}

/**
 * Konservativer Coverage-„Floor" allein aus der Altersklasse — ohne Live-Scrape.
 * Genutzt fürs Onboarding-Ausblenden (`none`) und als Sofort-Default beim Anlegen.
 * Die echte `full`/`results_only`-Unterscheidung für C/D liefert die Live-Probe
 * bzw. der Crawl nach (kann via {@link combineCoverage} nur nach oben korrigieren).
 */
export function coverageFloorFromAgeClass(ageClass: AgeClass): Coverage {
  switch (ageClass) {
    case "herren":
    case "frauen":
    case "alte_herren":
    case "A":
    case "B":
      return "full";
    case "C":
    case "D":
      return "results_only";
    case "E":
    case "F":
    case "G":
      return "none";
    case "unbekannt":
    default:
      // Unbekannt → nicht voreilig ausblenden; wie eine Seniorenmannschaft behandeln.
      return "full";
  }
}

/** Bequemer Shortcut: Coverage-Floor direkt aus dem Mannschaftsnamen. */
export function coverageFloorFromTeamName(name: string): Coverage {
  return coverageFloorFromAgeClass(ageClassFromTeamName(name));
}

/**
 * Trigger, die ZWINGEND benannte Torschützen aus fußball.de brauchen und daher
 * nur bei `full`-Coverage anbietbar/auswertbar sind:
 * - `goal_by_player` — Tor eines konkret benannten Spielers.
 * - `hattrick`       — 3 Tore desselben Spielers (braucht Spieler-Zuordnung).
 *
 * NICHT enthalten: manuell vom Verein gemeldete Spieler-Events (Spezialtor,
 * Karte, Assist, Spieler des Spiels) — die hängen nicht am Scraper.
 */
export const NAMED_SCORER_TRIGGERS: ReadonlySet<TriggerType> = new Set<TriggerType>([
  "goal_by_player",
  "hattrick"
]);

export function requiresNamedScorers(type: string): boolean {
  return NAMED_SCORER_TRIGGERS.has(type as TriggerType);
}

/**
 * Darf für eine Mannschaft mit gegebener Coverage ein Trigger dieses Typs
 * angelegt/ausgewertet werden?
 * - `null`               → unklassifizierter Bestand → wie `full` (Grandfather).
 * - `none`/`results_only` → alles außer {@link NAMED_SCORER_TRIGGERS} — bei
 *   `none` läuft schlicht ALLES über manuelle Meldung + Sponsor-Approval
 *   (ein Komplett-Block machte die seit Phase 4 onboardbaren Jugend-Teams
 *   unsponserbar — toter Zustand).
 * - `full`               → alles.
 */
export function coverageAllowsTrigger(
  coverage: Coverage | null | undefined,
  type: string
): boolean {
  if (coverage == null) return true; // unklassifiziert → großzügig (Bestand schonen)
  if (coverage === "none" || coverage === "results_only") {
    return !requiresNamedScorers(type);
  }
  return true; // full
}
