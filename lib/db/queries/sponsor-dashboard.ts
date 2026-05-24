import { and, eq, gte, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges, pledges, eventApprovals, pledgeRules, sponsors } from "@/lib/db/schema";

export interface SponsorDashboardStats {
  activePledges: number;
  thisMonthCents: number;
  lifetimeCents: number;
  pendingApprovals: number;
}

/**
 * KPI-Aggregat für das Sponsor-Dashboard.
 *
 * - activePledges: pledges mit status='active' für diesen Sponsor
 * - thisMonthCents: SUM(amountCents) confirmed Charges im aktuellen Monat
 * - lifetimeCents: SUM(amountCents) aller confirmed+invoiced Charges
 * - pendingApprovals: offene event_approvals des Sponsors
 */
export async function getSponsorDashboardStats(
  sponsorId: string
): Promise<SponsorDashboardStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [activeRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(pledges)
    .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.status, "active")));

  const [chargeRow] = await db
    .select({
      monthCents: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
        WHERE ${charges.status} = 'confirmed'
          AND ${charges.confirmedAt} >= ${monthStart.toISOString()}
          AND ${charges.confirmedAt} < ${monthEnd.toISOString()}
      ), 0)::int`,
      lifetimeCents: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
        WHERE ${charges.status} IN ('confirmed','invoiced')
      ), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(eq(pledges.sponsorId, sponsorId));

  const [pendingRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(eventApprovals)
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(and(eq(pledges.sponsorId, sponsorId), eq(eventApprovals.status, "pending")));

  return {
    activePledges: Number(activeRow?.c ?? 0),
    thisMonthCents: Number(chargeRow?.monthCents ?? 0),
    lifetimeCents: Number(chargeRow?.lifetimeCents ?? 0),
    pendingApprovals: Number(pendingRow?.c ?? 0)
  };
}

export interface MonthlySparklinePoint {
  /** "YYYY-MM" */
  month: string;
  cents: number;
}

/**
 * Monatliche Summe (confirmed+invoiced) der letzten N Monate für einen Sponsor.
 * Liefert immer N Punkte inklusive Lücken (Monate ohne Charges → 0).
 */
export async function getSponsorMonthlyCharges(
  sponsorId: string,
  monthsBack = 6
): Promise<MonthlySparklinePoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const rows = await db
    .select({
      month: sql<string>`to_char(${charges.createdAt}, 'YYYY-MM')`,
      cents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.sponsorId, sponsorId),
        inArray(charges.status, ["confirmed", "invoiced"]),
        gte(charges.createdAt, start)
      )
    )
    .groupBy(sql`to_char(${charges.createdAt}, 'YYYY-MM')`);

  const map = new Map(rows.map((r) => [r.month, Number(r.cents)]));
  const out: MonthlySparklinePoint[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, cents: map.get(key) ?? 0 });
  }
  return out;
}

/**
 * Sponsor-Record für einen User finden (oder null).
 */
export async function findSponsorForUser(userId: string) {
  const [s] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, userId))
    .limit(1);
  return s ?? null;
}
