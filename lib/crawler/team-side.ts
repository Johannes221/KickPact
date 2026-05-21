/**
 * Detects which side (heim/gast) a team is on by comparing
 * the team's name with the heim/gast names in a match.
 *
 * Problem with naive "first word" approach:
 *   "Herren - FC Sportfreunde 1910 Dossenheim 3" → first word = "herren"
 *   "herren" does NOT appear in "FC Sportfreunde 1910 Dossenheim 3"
 *   → always falls through to "gast" even when team is heim
 *
 * Fix: try all significant words (>=5 chars, not numbers/separators),
 * return "heim" if any match in heimName, "gast" otherwise.
 */
export function detectTeamSide(
  teamName: string,
  heimName: string
): "heim" | "gast" {
  const teamNorm = teamName.toLowerCase();
  const heimNorm = heimName.toLowerCase();

  // Extract significant words: >=5 chars, not pure numbers, not dash separator
  const words = teamNorm
    .split(/[\s/\\]+/)
    .filter(
      (w) =>
        w.length >= 5 &&
        !/^\d+$/.test(w) &&
        w !== "herren" &&
        w !== "damen" &&
        w !== "junioren" &&
        w !== "senioren"
    );

  // If any significant word from team name appears in heimName → team is heim
  for (const word of words) {
    if (heimNorm.includes(word)) return "heim";
  }
  return "gast";
}
