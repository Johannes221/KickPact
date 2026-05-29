/**
 * Detects which side (heim/gast) a team is on by comparing the team's (and
 * optionally the club's) name with the heim name of a match.
 *
 * Problem mit dem naiven "first word"-Ansatz:
 *   "Herren - FC Sportfreunde 1910 Dossenheim 3" → first word = "herren"
 *   "herren" steht nicht in "FC Sportfreunde 1910 Dossenheim 3"
 *   → fällt immer auf "gast" zurück, auch wenn das Team heim ist.
 *
 * Zweiter, subtilerer Fall (Regression nach getMannschaften-Rewrite): der
 * Mannschafts-Name enthält gar keinen Vereins-Token mehr, z.B. "1. Herren".
 * Dann liefern weder "1." noch "herren" einen Treffer und die Erkennung kippt
 * IMMER auf "gast" → invertierte Stats UND (kritisch) falsche Charge-Seite in
 * evaluate-match. Deshalb akzeptiert der Helper jetzt mehrere Namensquellen:
 * Aufrufer übergeben `[team.name, club.name]`, sodass der identifizierende
 * Vereins-Token (z.B. "schriesheim") für das Matching zur Verfügung steht.
 *
 * Fix: alle signifikanten Wörter (>=5 Zeichen, keine Zahlen/Rollen-Prefixe)
 * aus den übergebenen Namen sammeln; "heim" sobald eines davon im heimName
 * vorkommt, sonst "gast".
 */
const ROLE_WORDS = new Set(["herren", "damen", "junioren", "senioren"]);

export function detectTeamSide(
  teamName: string | string[],
  heimName: string
): "heim" | "gast" {
  const names = Array.isArray(teamName) ? teamName : [teamName];
  const heimNorm = heimName.toLowerCase();

  // Signifikante Wörter aus allen Namensquellen: >=5 Zeichen, keine reinen
  // Zahlen, keine Rollen-Prefixe ("herren", "damen", …). Dedupe via Set.
  const words = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    for (const w of name.toLowerCase().split(/[\s/\\]+/)) {
      if (w.length >= 5 && !/^\d+$/.test(w) && !ROLE_WORDS.has(w)) {
        words.add(w);
      }
    }
  }

  // Sobald ein signifikantes Wort im heimName vorkommt → Team ist heim.
  for (const word of words) {
    if (heimNorm.includes(word)) return "heim";
  }
  return "gast";
}
