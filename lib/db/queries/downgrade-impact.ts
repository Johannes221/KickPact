import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, teams } from "@/lib/db/schema";
import {
  BASIC_LOST_FEATURES,
  computeImpactNumbers,
  type DowngradeImpact
} from "@/lib/billing/downgrade-impact";

/**
 * Aggregiert die echten Verein-Daten zu einem DowngradeImpact fürs Abo-Panel
 * (Loss-Framing am Trial-Ende). Reine Lese-Query, ändert nichts.
 */
export async function getDowngradeImpact(clubId: string): Promise<DowngradeImpact> {
  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));
  const teamIds = teamRows.map((t) => t.id);

  if (teamIds.length === 0) {
    return {
      hasData: false,
      activeSponsors: 0,
      sponsorsOverCap: 0,
      rulesOverCap: 0,
      lostFeatures: [...BASIC_LOST_FEATURES]
    };
  }

  // Aktive Sponsoren je Team.
  const sponsorRows = await db
    .select({
      teamId: pledges.teamId,
      c: sql<number>`count(distinct ${pledges.sponsorId})::int`
    })
    .from(pledges)
    .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")))
    .groupBy(pledges.teamId);

  // Aktive Pledge-Regeln je (Sponsor, Team).
  const ruleRows = await db
    .select({
      sponsorId: pledges.sponsorId,
      teamId: pledges.teamId,
      c: sql<number>`count(${pledgeRules.id})::int`
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        inArray(pledges.teamId, teamIds),
        eq(pledges.status, "active"),
        eq(pledgeRules.active, true)
      )
    )
    .groupBy(pledges.sponsorId, pledges.teamId);

  const { activeSponsors, sponsorsOverCap, rulesOverCap } = computeImpactNumbers({
    perTeamSponsorCounts: sponsorRows.map((r) => Number(r.c)),
    perSponsorRuleCounts: ruleRows.map((r) => Number(r.c))
  });

  return {
    hasData: activeSponsors > 0,
    activeSponsors,
    sponsorsOverCap,
    rulesOverCap,
    lostFeatures: [...BASIC_LOST_FEATURES]
  };
}
