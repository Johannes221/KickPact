import slugify from "slugify";

/**
 * Baut einen URL-Slug für die öffentliche Mannschafts-Profilseite
 * `/m/{slug}`. Kombiniert Verein + Mannschaft, hängt ein kurzes Zufalls-
 * Suffix an (Kollisions-Vermeidung) — analog zum Club-Slug beim Onboarding.
 *
 *   buildTeamPublicSlug("FC Beispiel", "1. Herren") → "fc-beispiel-1-herren-a3f9"
 *
 * Das Suffix wird über `randomSuffix` injiziert (kein Math.random im Modul-
 * Scope), damit Aufrufer es deterministisch testen können.
 */
export function buildTeamPublicSlug(
  clubName: string,
  teamName: string,
  randomSuffix: string
): string {
  const base = slugify(`${clubName} ${teamName}`, {
    lower: true,
    strict: true,
    trim: true
  });
  const safeBase = base || "team";
  return `${safeBase}-${randomSuffix}`;
}

/** Vier-Zeichen base36-Suffix (z.B. "a3f9"). */
export function makeSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
