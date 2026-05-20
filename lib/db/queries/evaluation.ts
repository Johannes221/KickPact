import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pledges,
  pledgeRules,
  matches,
  charges
} from "@/lib/db/schema";
import type { PledgeRuleInput } from "@/lib/crawler/triggers";

export async function loadActivePledgeRulesForTeam(
  teamId: string,
  asOf: Date
): Promise<PledgeRuleInput[]> {
  const rows = await db
    .select({
      ruleId: pledgeRules.id,
      pledgeId: pledgeRules.pledgeId,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents,
      perMatchCapCents: pledgeRules.perMatchCapCents
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        eq(pledges.status, "active"),
        lte(pledges.startsAt, asOf),
        gte(pledges.endsAt, asOf)
      )
    );

  return rows.map((r) => ({
    id: r.ruleId,
    pledgeId: r.pledgeId,
    triggerType: r.triggerType,
    triggerParams: (r.triggerParams ?? {}) as Record<string, unknown>,
    amountCents: r.amountCents,
    perMatchCapCents: r.perMatchCapCents
  }));
}

export async function getMatch(matchId: string) {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  return m ?? null;
}

/**
 * Liefert die Summe aller `confirmed` + `pending_approval` + `invoiced` Charges
 * für einen Pledge im laufenden Monat (basierend auf asOf).
 */
export async function getMonthlyChargedCents(pledgeId: string, asOf: Date): Promise<number> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .where(
      and(
        eq(charges.pledgeId, pledgeId),
        gte(charges.createdAt, monthStart),
        sql`${charges.createdAt} < ${monthEnd}`,
        sql`${charges.status} IN ('confirmed', 'pending_approval', 'invoiced')`
      )
    );
  return row?.total ?? 0;
}

export async function getPledgeMonthlyCap(pledgeId: string): Promise<number | null> {
  const [p] = await db
    .select({ cap: pledges.monthlyCapCents })
    .from(pledges)
    .where(eq(pledges.id, pledgeId))
    .limit(1);
  return p?.cap ?? null;
}
