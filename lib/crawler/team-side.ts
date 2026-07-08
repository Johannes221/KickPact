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

/**
 * Signifikante Namens-Token für das Namens-Matching: >=5 Zeichen, keine reinen
 * Zahlen, keine Rollen-Prefixe ("herren", "damen", …). Genau die Wörter, an
 * denen `detectTeamSide` eine Mannschaft im gegnerischen Spielnamen wiedererkennt
 * — und damit auch die Wörter, die eine Namens-KOLLISION auslösen können
 * (`matchHasNameCollision`).
 */
export function significantNameTokens(names: string | string[]): Set<string> {
  const list = Array.isArray(names) ? names : [names];
  const words = new Set<string>();
  for (const name of list) {
    if (!name) continue;
    for (const w of name.toLowerCase().split(/[\s/\\]+/)) {
      if (w.length >= 5 && !/^\d+$/.test(w) && !ROLE_WORDS.has(w)) {
        words.add(w);
      }
    }
  }
  return words;
}

export function detectTeamSide(
  teamName: string | string[],
  heimName: string
): "heim" | "gast" {
  const heimNorm = heimName.toLowerCase();
  // Sobald ein signifikantes Wort im heimName vorkommt → Team ist heim.
  for (const word of significantNameTokens(teamName)) {
    if (heimNorm.includes(word)) return "heim";
  }
  return "gast";
}

/**
 * Hat dieses Match eine echte Namens-Kollision — teilt sich also ein
 * signifikanter Token der eigenen Mannschaft/des Vereins mit BEIDEN Seiten des
 * Spiels? Genau dann ist `detectTeamSide` unzuverlässig: der Token kommt sowohl
 * im Heim- als auch im Gastnamen vor (Reserve-Derby "SV X II" vs "SV X III";
 * gleiche Stadt "TSG Weinheim" vs "FC Weinheim"), und das reine Namens-Matching
 * kann auf die falsche Seite kippen → invertierter Ausgang → Falschgeld.
 *
 * Die breite Masse (eigener Token nur im eigenen Seitennamen) ist hierdurch
 * unbetroffen und braucht keinen deterministischen team-id-Rescrape.
 */
export function matchHasNameCollision(
  ownNames: string | string[],
  heimName: string,
  gastName: string | null | undefined
): boolean {
  if (!gastName) return false;
  const heim = heimName.toLowerCase();
  const gast = gastName.toLowerCase();
  for (const w of significantNameTokens(ownNames)) {
    if (heim.includes(w) && gast.includes(w)) return true;
  }
  return false;
}

/**
 * Bestimmt die eigene Spielseite DETERMINISTISCH über die eindeutige
 * fussball.de-team-id — die einzige kollisionsfreie Kennung. Namens-Matching
 * (detectTeamSide) kippt bei Reserve-Derbys ("SV X II" vs "SV X III") und
 * gleicher Stadt ("TSG Weinheim" vs "FC Weinheim") systematisch auf die falsche
 * Seite → invertierte Stats UND falsche Charge-Seite (stilles Falschgeld).
 *
 * Die team-id gewinnt immer, wenn `ownFussballdeTeamId` gespeichert ist UND auf
 * genau einer Seite des Matches auftaucht. Nur als Fallback — für Alt-Matches
 * ohne gespeicherte team-ids oder bei Datendrift (id passt auf keine Seite) —
 * greift das Namens-Matching. So werden gespeicherte, aber inkonsistente ids nie
 * zu einer stillen Fehlentscheidung; im Zweifel entscheidet der Name.
 */
export function resolveTeamSide(
  match: {
    heimTeamId: string | null;
    gastTeamId: string | null;
    heimName: string;
    gastName?: string | null;
  },
  ownFussballdeTeamId: string | null,
  fallbackNames: string | string[]
): "heim" | "gast" {
  if (ownFussballdeTeamId) {
    if (match.heimTeamId === ownFussballdeTeamId) return "heim";
    if (match.gastTeamId === ownFussballdeTeamId) return "gast";
  }
  return detectTeamSide(fallbackNames, match.heimName);
}
