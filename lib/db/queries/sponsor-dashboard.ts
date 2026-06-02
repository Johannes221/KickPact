import { and, eq, gte, lt, desc, sql, inArray } from "drizzle-orm";
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

export interface SponsorDashboardKpis {
  activePledgeCount: number;
  monthlyCents: number;
  biggestRecent: { amountCents: number; triggerType: string; createdAt: Date } | null;
  ytdCents: number;
  lastYearCents: number;
}

/**
 * KPI-Kacheln des Sponsor-Dashboards (/sponsor): aktive Pacts, Monats-Summe,
 * größter Einzel-Charge, Jahres-Total + Vorjahres-Vergleich. Cap-Auslastung
 * läuft separat über getCapUsageForActivePledges (sponsor-reporting).
 */
export async function getSponsorDashboardKpis(
  sponsorId: string,
  now: Date
): Promise<SponsorDashboardKpis> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const lastYearEnd = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [activePledgeCount, monthlyCents, biggestRecent, yearStats] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.status, "active")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(eq(pledges.sponsorId, sponsorId), gte(charges.createdAt, monthStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({
        amountCents: charges.amountCents,
        triggerType: charges.triggerType,
        createdAt: charges.createdAt
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(eq(pledges.sponsorId, sponsorId))
      .orderBy(desc(charges.amountCents))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({
        ytd: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
          WHERE ${charges.createdAt} >= ${yearStart.toISOString()}
        ), 0)::int`,
        lastYear: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
          WHERE ${charges.createdAt} >= ${lastYearStart.toISOString()}
            AND ${charges.createdAt} <  ${lastYearEnd.toISOString()}
        ), 0)::int`
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(
        and(
          eq(pledges.sponsorId, sponsorId),
          inArray(charges.status, ["confirmed", "invoiced"]),
          gte(charges.createdAt, lastYearStart),
          lt(charges.createdAt, new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)))
        )
      )
      .then((r) => ({
        ytdCents: Number(r[0]?.ytd ?? 0),
        lastYearCents: Number(r[0]?.lastYear ?? 0)
      }))
  ]);

  return {
    activePledgeCount,
    monthlyCents,
    biggestRecent,
    ytdCents: yearStats.ytdCents,
    lastYearCents: yearStats.lastYearCents
  };
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
