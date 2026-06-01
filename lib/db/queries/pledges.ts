import { and, count, countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, teamLicenses, teams } from "@/lib/db/schema";
import type { PlanKey } from "@/lib/stripe/pricing";

/**
 * Zählt unterschiedliche aktive Sponsoren auf einem Team. Pausierte und
 * abgelaufene Pledges zählen NICHT (relevant für Basic-Cap).
 */
export async function countActiveSponsorsForTeam(teamId: string): Promise<number> {
  const rows = await db
    .select({ value: countDistinct(pledges.sponsorId) })
    .from(pledges)
    .where(and(eq(pledges.teamId, teamId), eq(pledges.status, "active")));
  return rows[0]?.value ?? 0;
}

/**
 * Zählt Pledge-Rules eines Sponsors auf einem Team (über aktive Pledges).
 */
export async function countPledgeRulesForSponsorOnTeam(
  sponsorId: string,
  teamId: string
): Promise<number> {
  const rows = await db
    .select({ value: count(pledgeRules.id) })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        eq(pledges.sponsorId, sponsorId),
        eq(pledges.status, "active"),
        // Soft-gelöschte Wetten zählen nicht gegen das Plan-Limit (Migration 0040).
        eq(pledgeRules.active, true)
      )
    );
  return rows[0]?.value ?? 0;
}

/**
 * Liefert den effektiven Plan für ein Team, mit folgender Priorität:
 *
 * 1. Direkte `team_licenses`-Row → ihren `plan` zurückgeben.
 * 2. Wenn `team_licenses.parent_club_license_id` gesetzt → den Plan der
 *    Parent-License übernehmen (Vereinslizenz-Bündelung; eine Verein-License
 *    deckt mehrere Teams ab).
 * 3. Falls keine Team-License existiert: schauen ob der Club eine
 *    `subscriptions.plan === 'verein'` mit aktivem/trialing Status hat →
 *    impliziert Verein-Plan für alle Teams.
 * 4. Default: `basic`.
 *
 * Fixt Pricing-v2-Audit #5 (parentClubLicenseId tote Spalte).
 */
export async function getTeamLicensePlan(teamId: string): Promise<PlanKey> {
  // 1) Direct license on team
  const [direct] = await db
    .select({ plan: teamLicenses.plan, parentId: teamLicenses.parentClubLicenseId })
    .from(teamLicenses)
    .where(eq(teamLicenses.teamId, teamId))
    .limit(1);

  if (direct?.plan && !direct.parentId) {
    return direct.plan as PlanKey;
  }

  // 2) Resolved via parent license
  if (direct?.parentId) {
    const [parent] = await db
      .select({ plan: teamLicenses.plan })
      .from(teamLicenses)
      .where(eq(teamLicenses.id, direct.parentId))
      .limit(1);
    if (parent?.plan) return parent.plan as PlanKey;
  }

  // 3) Verein-Plan auf irgendeiner team_license desselben Clubs → impliziert
  //    Vereinslizenz-Bündelung für alle Teams dieses Clubs.
  const [teamRow] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (teamRow?.clubId) {
    const [vereinLicense] = await db
      .select({ plan: teamLicenses.plan })
      .from(teamLicenses)
      .where(
        and(
          eq(teamLicenses.subscriptionClubId, teamRow.clubId),
          eq(teamLicenses.plan, "verein")
        )
      )
      .limit(1);
    if (vereinLicense?.plan === "verein") return "verein";
  }

  // 4) Default
  return (direct?.plan as PlanKey | undefined) ?? "basic";
}
