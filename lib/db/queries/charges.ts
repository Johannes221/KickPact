import { and, eq, gte, inArray, lte, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges, pledges, matches, teams, eventApprovals } from "@/lib/db/schema";

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
 * Markiert alle nicht-invoiced charges für ein Match als `cancelled`.
 *
 * Wird vom Match-Update-Path im Crawler aufgerufen wenn fussball.de Daten
 * für ein bereits gescraptes Spiel ändert (z.B. Korrektur des Ergebnisses,
 * nachgetragene Tore). Vor der Re-Evaluation müssen alle vorherigen Charges
 * unschädlich gemacht werden, damit `evaluate-match` neu zählen kann.
 *
 * `invoiced` Charges werden bewusst NICHT angefasst — sie wurden bereits
 * dem Sponsor in Rechnung gestellt und sind out-of-scope für Korrekturen
 * (das wäre Buchhaltung, nicht Crawler-Logik).
 */
export async function invalidateChargesForMatch(
  matchId: string,
  reason: string
): Promise<void> {
  // Audit 2026-05-24 Task 2.3: Approvals MÜSSEN auch expired werden, sonst
  // kann der Sponsor einen cancelled Charge via "Bestätigen" wiederbeleben
  // (siehe approvals.confirmApproval). Atomar in einer Transaction.
  await db.transaction(async (tx) => {
    const affectedCharges = await tx
      .select({ matchEventId: charges.matchEventId })
      .from(charges)
      .where(and(eq(charges.matchId, matchId), ne(charges.status, "invoiced")));

    await tx
      .update(charges)
      .set({ status: "cancelled", cancelledReason: reason })
      .where(and(eq(charges.matchId, matchId), ne(charges.status, "invoiced")));

    const eventIds = affectedCharges
      .map((c) => c.matchEventId)
      .filter((id): id is string => id !== null);
    if (eventIds.length > 0) {
      await tx
        .update(eventApprovals)
        .set({ status: "expired", respondedAt: new Date() })
        .where(
          and(
            inArray(eventApprovals.matchEventId, eventIds),
            eq(eventApprovals.status, "pending")
          )
        );
    }
  });
}

/**
 * Cancel a single charge by club admin/trainer.
 *
 * Rules:
 *  - Only `confirmed` or `pending_approval` charges can be cancelled.
 *    `invoiced` charges have already been billed — touching them is accounting,
 *    not an ops action.
 *  - The charge must belong to the given club (via pledge → team → club).
 *
 * Returns `true` when cancelled, `false` when the charge was not found,
 * already in a terminal state, or doesn't belong to the club.
 */
export async function cancelChargeForClub(
  chargeId: string,
  clubId: string,
  reason: string
): Promise<boolean> {
  const result = await db
    .update(charges)
    .set({ status: "cancelled", cancelledReason: reason })
    .where(
      and(
        eq(charges.id, chargeId),
        notInArray(charges.status, ["cancelled", "invoiced"]),
        // Tenant check: charge.pledgeId → pledges.teamId → teams.clubId
        inArray(
          charges.pledgeId,
          db
            .select({ id: pledges.id })
            .from(pledges)
            .innerJoin(teams, eq(pledges.teamId, teams.id))
            .where(eq(teams.clubId, clubId))
        )
      )
    )
    .returning({ id: charges.id });
  return result.length > 0;
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
