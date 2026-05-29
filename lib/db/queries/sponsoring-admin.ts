import { and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  pledgeRules,
  sponsors,
  users,
  teams,
  clubs,
  eventApprovals,
  matchEvents
} from "@/lib/db/schema";

export type ChargeStatus = "pending_approval" | "confirmed" | "invoiced" | "cancelled";

export interface AdminChargeRow {
  id: string;
  amountCents: number;
  triggerType: string;
  status: ChargeStatus;
  createdAt: Date;
  cancelledReason: string | null;
  sponsorName: string;
  clubName: string;
  clubSlug: string;
  teamName: string;
}

export async function listChargesForAdmin(opts?: {
  status?: ChargeStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ charges: AdminChargeRow[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const conds = [];
  if (opts?.status) conds.push(eq(charges.status, opts.status));
  if (opts?.search && opts.search.trim().length > 0) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(ilike(clubs.name, q), ilike(sponsors.displayName, q), ilike(teams.name, q)));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const baseFrom = db
    .select({
      id: charges.id,
      amountCents: charges.amountCents,
      triggerType: charges.triggerType,
      status: charges.status,
      createdAt: charges.createdAt,
      cancelledReason: charges.cancelledReason,
      sponsorName: sponsors.displayName,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      teamName: teams.name
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id));

  const rows = await baseFrom
    .where(where)
    .orderBy(desc(charges.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(where);

  return { charges: rows, total: count };
}

/**
 * Operator-Storno einer Charge. Im Gegensatz zu cancelChargeForClub OHNE
 * Tenant-Beschränkung (Operator ist global). Bereits stornierte oder bereits
 * fakturierte (invoiced) Charges werden nicht angefasst.
 */
export async function cancelChargeAsOperator(chargeId: string, reason: string): Promise<boolean> {
  const result = await db
    .update(charges)
    .set({ status: "cancelled", cancelledReason: reason })
    .where(and(eq(charges.id, chargeId), notInArray(charges.status, ["cancelled", "invoiced"])))
    .returning({ id: charges.id });
  return result.length > 0;
}

export interface AdminApprovalRow {
  id: string;
  status: "pending" | "confirmed" | "disputed" | "expired";
  disputeReason: string | null;
  expiresAt: Date;
  createdAt: Date;
  eventType: string;
  sponsorName: string;
  teamName: string;
  clubName: string;
}

/**
 * Offene/strittige Event-Approvals für die Operator-Sicht (read-only).
 * Default: pending + disputed.
 */
export async function listOpenApprovals(opts?: {
  statuses?: Array<"pending" | "confirmed" | "disputed" | "expired">;
  limit?: number;
}): Promise<AdminApprovalRow[]> {
  const statuses = opts?.statuses ?? ["pending", "disputed"];
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 300);

  return db
    .select({
      id: eventApprovals.id,
      status: eventApprovals.status,
      disputeReason: eventApprovals.disputeReason,
      expiresAt: eventApprovals.expiresAt,
      createdAt: eventApprovals.createdAt,
      eventType: matchEvents.type,
      sponsorName: sponsors.displayName,
      teamName: teams.name,
      clubName: clubs.name
    })
    .from(eventApprovals)
    .innerJoin(matchEvents, eq(eventApprovals.matchEventId, matchEvents.id))
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(inArray(eventApprovals.status, statuses))
    .orderBy(desc(eventApprovals.createdAt))
    .limit(limit);
}
