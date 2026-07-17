/**
 * Wachhund über die Wettbewerbs-Marker der echten fussball.de-Captures.
 *
 * fussball.de hängt an jeden Wettbewerb ein Zwei-Buchstaben-Kürzel:
 *   ME = Meisterschaft (Liga) · PO = Pokal · FS = Freundschaftsspiel ·
 *   TU = Vereinsturnier
 * Davon hängt GELD ab: `evaluate-match` zahlt auf Liga und Pokal, nicht auf
 * Freundschaftsspiele/Turniere (Entscheid 2026-07-17).
 *
 * Ein Marker, den `parseCompetition` nicht kennt, landet auf `unknown` und zahlt
 * damit still weiter — genau so wäre `TU` (Vereinsturnier) durchgerutscht, wenn
 * es der Review nicht gefunden hätte. Dieser Test schlägt an, sobald in den
 * Captures ein Kürzel auftaucht, das wir nicht eingeordnet haben. Er ersetzt
 * keine Live-Überwachung, senkt aber die Chance, den nächsten Marker erst auf
 * einer Rechnung zu bemerken.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { extractLeagueFromCompetitionText } from "@/lib/crawler/fussballde";
import { parseCompetition } from "@/lib/utils/league";
import { HTML_ROOT } from "../../fixtures/scraper/config";

/** Alle Wettbewerbs-Bezeichnungen aus allen gecapturten HTML-Seiten. */
function collectCompetitions(): string[] {
  const out: string[] = [];
  let clubs: string[];
  try {
    clubs = fs.readdirSync(HTML_ROOT);
  } catch {
    return out;
  }
  for (const club of clubs) {
    const dir = path.join(HTML_ROOT, club);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".html")) continue;
      const root = parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      for (const tr of root.querySelectorAll("tr")) {
        if (!tr.classList.contains("row-competition")) continue;
        const league = extractLeagueFromCompetitionText(
          tr.text.replace(/\s+/g, " ").trim()
        );
        if (league) out.push(league);
      }
    }
  }
  return out;
}

describe("Wettbewerbs-Marker in den Fixtures", () => {
  const competitions = collectCompetitions();

  it("findet überhaupt Wettbewerbs-Zeilen (sonst testet der Rest nichts)", () => {
    expect(competitions.length).toBeGreaterThan(100);
  });

  it("kennt JEDEN Zwei-Buchstaben-Marker, der in den Captures vorkommt", () => {
    const unbekannt = new Map<string, string>();
    for (const c of competitions) {
      const marker = c.match(/\s([A-Z]{2})$/)?.[1];
      if (!marker) continue; // kein Marker → nichts zu kennen
      if (parseCompetition(c).type === "unknown") unbekannt.set(marker, c);
    }
    // Aussagekräftige Fehlermeldung: welcher Marker, welches Beispiel.
    expect(
      [...unbekannt].map(([m, bsp]) => `${m} (z.B. "${bsp}")`),
      "Unbekannte Marker zahlen still weiter — in lib/utils/league.ts einordnen"
    ).toEqual([]);
  });

  it("ordnet die bekannten Marker korrekt ein", () => {
    const byType = { league: 0, cup: 0, friendly: 0, unknown: 0 };
    for (const c of competitions) byType[parseCompetition(c).type]++;
    // Die Captures enthalten Liga-, Pokal-, Freundschafts- und Turnierspiele.
    expect(byType.league).toBeGreaterThan(0);
    expect(byType.cup).toBeGreaterThan(0);
    expect(byType.friendly).toBeGreaterThan(0);
  });
});
