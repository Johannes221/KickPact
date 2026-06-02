import { and, eq, gte, lt, desc, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges, pledges, sponsors } from "@/lib/db/schema";

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

/** Legt ein Sponsor-Profil für einen User an und liefert die neue Sponsor-Row. */
export async function createSponsorProfile(values: typeof sponsors.$inferInsert) {
  const [sponsor] = await db.insert(sponsors).values(values).returning();
  return sponsor;
}
