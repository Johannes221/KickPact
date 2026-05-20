import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges, pledges, matches, teams } from "@/lib/db/schema";

export interface ChargeForBilling {
  chargeId: string;
  sponsorId: string;
  clubId: string;
  triggerType: string;
  amountCents: number;
  matchDate: Date | string;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
}

/**
 * Listet alle `confirmed` charges deren `confirmedAt` im angegebenen Zeitraum liegt.
 * Wird vom monatlichen Invoicing-Cron genutzt um pro (sponsor, club) eine Rechnung
 * zu erzeugen.
 */
export async function listConfirmedChargesByPeriod(opts: {
  periodStart: Date;
  periodEnd: Date;
}): Promise<ChargeForBilling[]> {
  const rows = await db
    .select({
      chargeId: charges.id,
      sponsorId: pledges.sponsorId,
      clubId: teams.clubId,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      matchDate: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(matches, eq(charges.matchId, matches.id))
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .where(
      and(
        eq(charges.status, "confirmed"),
        gte(charges.confirmedAt, opts.periodStart),
        lte(charges.confirmedAt, opts.periodEnd)
      )
    );
  return rows;
}

/**
 * Groupiert charges nach (sponsorId, clubId) — eine Rechnung pro Paar.
 */
export function groupChargesBySponsorClub<T extends { sponsorId: string; clubId: string }>(
  rows: T[]
): { sponsorId: string; clubId: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = `${r.sponsorId}|${r.clubId}`;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()].map(([key, items]) => {
    const [sponsorId, clubId] = key.split("|");
    return { sponsorId, clubId, items };
  });
}

/**
 * Helper: bezahlt Übersicht-Zähler für ein Dashboard.
 */
export async function countConfirmedChargesForSponsorClub(opts: {
  sponsorId: string;
  clubId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int`, sum: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int` })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(matches, eq(charges.matchId, matches.id))
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .where(
      and(
        eq(charges.status, "confirmed"),
        eq(pledges.sponsorId, opts.sponsorId),
        eq(teams.clubId, opts.clubId),
        gte(charges.confirmedAt, opts.periodStart),
        lte(charges.confirmedAt, opts.periodEnd)
      )
    );
  return { count: row?.count ?? 0, sumCents: row?.sum ?? 0 };
}
