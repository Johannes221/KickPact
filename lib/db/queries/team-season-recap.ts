import { and, between, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges } from "@/lib/db/schema/charges";
import { pledges } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { teams } from "@/lib/db/schema/clubs";
import { getSeasonByCode } from "@/lib/db/queries/seasons";

export interface TeamSeasonRecap {
  teamName: string;
  saison: string;
  totalCents: number;
  eventCount: number;
  topSponsor: { name: string; cents: number } | null;
  topTrigger: { type: string; count: number } | null;
  biggest: { cents: number; type: string } | null;
}

/** Nur abgerechnete/bestätigte Charges zählen in den Recap. */
const COUNTED_STATUSES = ["confirmed", "invoiced"] as const;

/**
 * Aggregiert die Saison-Kennzahlen einer Mannschaft für den teilbaren Recap.
 *
 * Saison-Fenster: aus der `seasons`-Tabelle via team.saison-Code; fällt das
 * fehl, nutzen wir die letzten ~10 Monate als pragmatisches Fenster.
 * Liefert `null`, wenn das Team nicht existiert.
 */
export async function getTeamSeasonRecapStats(
  teamId: string,
  now: Date = new Date()
): Promise<TeamSeasonRecap | null> {
  const [team] = await db
    .select({ name: teams.name, saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const season = await getSeasonByCode(team.saison);
  const windowStart =
    season?.startsAt ?? new Date(now.getTime() - 305 * 24 * 60 * 60 * 1000);
  const windowEnd = season?.endsAt ?? now;

  const baseWhere = and(
    eq(pledges.teamId, teamId),
    inArray(charges.status, [...COUNTED_STATUSES]),
    between(charges.createdAt, windowStart, windowEnd)
  );

  const [totals] = await db
    .select({
      totalCents: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int`,
      eventCount: sql<number>`count(*)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(baseWhere);

  const [topSponsor] = await db
    .select({
      name: sponsors.displayName,
      cents: sql<number>`sum(${charges.amountCents})::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(baseWhere)
    .groupBy(sponsors.id, sponsors.displayName)
    .orderBy(desc(sql`sum(${charges.amountCents})`))
    .limit(1);

  const [topTrigger] = await db
    .select({
      type: charges.triggerType,
      count: sql<number>`count(*)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(baseWhere)
    .groupBy(charges.triggerType)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const [biggest] = await db
    .select({ cents: charges.amountCents, type: charges.triggerType })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(baseWhere)
    .orderBy(desc(charges.amountCents))
    .limit(1);

  return {
    teamName: team.name,
    saison: team.saison,
    totalCents: Number(totals?.totalCents ?? 0),
    eventCount: Number(totals?.eventCount ?? 0),
    topSponsor: topSponsor ? { name: topSponsor.name, cents: Number(topSponsor.cents) } : null,
    topTrigger: topTrigger ? { type: topTrigger.type, count: Number(topTrigger.count) } : null,
    biggest: biggest ? { cents: biggest.cents, type: biggest.type } : null
  };
}
