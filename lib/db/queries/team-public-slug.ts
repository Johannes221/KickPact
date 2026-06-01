import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { buildTeamPublicSlug, makeSlugSuffix } from "@/lib/utils/team-slug";

/**
 * Erzeugt einen kollisionsfreien öffentlichen Slug für eine Mannschaft
 * (Retry mit neuem Zufalls-Suffix). Schreibt NICHT — der Aufrufer setzt den
 * Slug. Reine DB-Lese-Query, daher außerhalb der „use server"-Action-Module,
 * damit beide Pfade (Profil-Editor + Discover-Toggle) sie teilen können.
 */
export async function generateUniqueTeamSlug(
  clubName: string,
  teamName: string,
  selfTeamId: string
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = buildTeamPublicSlug(clubName, teamName, makeSlugSuffix());
    const [clash] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.publicSlug, candidate), ne(teams.id, selfTeamId)))
      .limit(1);
    if (!clash) return candidate;
  }
  // Extrem unwahrscheinlich — Fallback mit teamId-Fragment garantiert eindeutig.
  return buildTeamPublicSlug(clubName, teamName, selfTeamId.slice(-6));
}
