import { and, count, countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, teamLicenses } from "@/lib/db/schema";
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
        eq(pledges.status, "active")
      )
    );
  return rows[0]?.value ?? 0;
}

/**
 * Liefert den aktuell auf dem Team aktiven Plan (`basic` Default).
 * Wenn keine Lizenz existiert → `basic`.
 */
export async function getTeamLicensePlan(teamId: string): Promise<PlanKey> {
  const rows = await db
    .select({ plan: teamLicenses.plan })
    .from(teamLicenses)
    .where(eq(teamLicenses.teamId, teamId))
    .limit(1);
  return (rows[0]?.plan as PlanKey | undefined) ?? "basic";
}
