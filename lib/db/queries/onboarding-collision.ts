import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  teamLicenses,
  clubMemberships,
  teamMemberships
} from "@/lib/db/schema";

/**
 * Onboarding-Kollisionslogik (Spec 2026-05-29). Zwei unabhängige Checks beim
 * „Mannschaft anlegen":
 *
 *  - Check A: Hat der reale Verein (fussballde_verein_id) eine AKTIVE
 *    Vereinslizenz? Nur dann ist „unter Lizenz anfragen" relevant — die bloße
 *    Existenz eines gleichnamigen Containers ist bedeutungslos.
 *  - Check B: Ist GENAU diese Mannschaft (fussballde_team_id) schon belegt? Der
 *    Schlüssel ist die Team-ID, nicht der Verein.
 */

export interface LicensedVereinMatch {
  clubId: string;
  clubSlug: string;
  clubName: string;
}

/**
 * Check A — liefert einen Verein-Container mit aktiver Vereinslizenz für diese
 * fussballde_verein_id, falls einer existiert. „Aktive Vereinslizenz" =
 * abgeschlossenes Onboarding + mindestens eine team_license mit plan='verein'
 * (gleiche Semantik wie effectivePlan='verein' in user-identities.ts).
 */
export async function findLicensedVereinByFussballdeId(
  fussballdeVereinId: string
): Promise<LicensedVereinMatch | null> {
  const [row] = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name
    })
    .from(clubs)
    .innerJoin(teams, eq(teams.clubId, clubs.id))
    .innerJoin(teamLicenses, eq(teamLicenses.teamId, teams.id))
    .where(
      and(
        eq(clubs.fussballdeVereinId, fussballdeVereinId),
        eq(clubs.onboardingStatus, "completed"),
        eq(teamLicenses.plan, "verein")
      )
    )
    .limit(1);

  return row ?? null;
}

/**
 * Check B — Kollision über fussballde_team_id (+ saison, analog dem Unique-Index
 * teams_fussballde_idx).
 *
 *  - none:              keine KickPact-Mannschaft mit dieser ID → frisch anlegen.
 *  - scraped-unmanaged: existiert, aber kein steuerndes Mitglied → leicht
 *                       andocken (Team-Row wird umgehängt).
 *  - actively-managed:  existiert und wird aktiv betreut → Zugriff anfragen.
 *
 * „Aktives/steuerndes Mitglied" (Spec-Entscheidung): clubMembership admin/trainer
 * ODER teamMembership admin. Ein viewer zählt nicht.
 */
export type TeamCollision =
  | { kind: "none" }
  | { kind: "scraped-unmanaged"; teamId: string; clubId: string }
  | { kind: "actively-managed"; teamId: string; clubId: string; clubSlug: string };

export async function checkTeamCollision(
  fussballdeTeamId: string,
  saison: string
): Promise<TeamCollision> {
  const [team] = await db
    .select({ id: teams.id, clubId: teams.clubId, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(
      and(
        eq(teams.fussballdeTeamId, fussballdeTeamId),
        eq(teams.saison, saison)
      )
    )
    .limit(1);

  if (!team) return { kind: "none" };

  const [clubController] = await db
    .select({ userId: clubMemberships.userId })
    .from(clubMemberships)
    .where(
      and(
        eq(clubMemberships.clubId, team.clubId),
        inArray(clubMemberships.role, ["admin", "trainer"])
      )
    )
    .limit(1);

  let managed = !!clubController;
  if (!managed) {
    const [teamController] = await db
      .select({ userId: teamMemberships.userId })
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.teamId, team.id),
          eq(teamMemberships.role, "admin")
        )
      )
      .limit(1);
    managed = !!teamController;
  }

  if (managed) {
    return {
      kind: "actively-managed",
      teamId: team.id,
      clubId: team.clubId,
      clubSlug: team.clubSlug
    };
  }
  return { kind: "scraped-unmanaged", teamId: team.id, clubId: team.clubId };
}
