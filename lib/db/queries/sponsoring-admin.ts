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
  matchEvents,
  teamLicenses,
  sponsorInvitations,
  sponsorInquiries
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

/**
 * Gebündelte Daten für die Vereins-Sponsoren-Seite (/verein/[slug]/sponsoren):
 * Teams (inkl. Verifikations-Gate + Plan), aktive Einladungen, aktive Sponsoren
 * und offene Discover-Anfragen.
 */
export async function getClubSponsorenOverview(clubId: string) {
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      discoverable: teams.discoverable,
      publicTagline: teams.publicTagline,
      containerVerifiedAt: clubs.verifiedAt,
      teamVerifiedAt: teams.verifiedAt,
      plan: teamLicenses.plan
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .leftJoin(teamLicenses, eq(teamLicenses.teamId, teams.id))
    .where(eq(teams.clubId, clubId));
  const teamIds = teamRows.map((t) => t.id);

  const invitations = teamIds.length
    ? await db
        .select({ inv: sponsorInvitations, team: teams })
        .from(sponsorInvitations)
        .innerJoin(teams, eq(sponsorInvitations.teamId, teams.id))
        .where(eq(teams.clubId, clubId))
        .orderBy(sponsorInvitations.createdAt)
    : [];

  const activeSponsors = teamIds.length
    ? await db
        .select({
          sponsorId: sponsors.id,
          displayName: sponsors.displayName,
          type: sponsors.type,
          userEmail: users.email,
          teamId: pledges.teamId,
          teamName: teams.name,
          pledgeStatus: pledges.status
        })
        .from(pledges)
        .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
        .innerJoin(users, eq(sponsors.userId, users.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .where(eq(teams.clubId, clubId))
    : [];

  const inquiries =
    teamIds.length > 0
      ? await db
          .select({
            id: sponsorInquiries.id,
            teamId: sponsorInquiries.teamId,
            teamName: teams.name,
            status: sponsorInquiries.status,
            message: sponsorInquiries.message,
            createdAt: sponsorInquiries.createdAt,
            sponsorEmail: users.email,
            sponsorName: users.name
          })
          .from(sponsorInquiries)
          .innerJoin(teams, eq(sponsorInquiries.teamId, teams.id))
          .innerJoin(users, eq(sponsorInquiries.sponsorUserId, users.id))
          .where(
            and(
              inArray(sponsorInquiries.teamId, teamIds),
              eq(sponsorInquiries.status, "pending")
            )
          )
          .orderBy(desc(sponsorInquiries.createdAt))
      : [];

  return { teamRows, invitations, activeSponsors, inquiries };
}

/** Offene Discover-Anfragen FÜR EINE Mannschaft (Team-Scope-Sponsoren-Seite). */
export async function listPendingInquiriesForTeam(teamId: string) {
  return db
    .select({
      id: sponsorInquiries.id,
      teamId: sponsorInquiries.teamId,
      teamName: teams.name,
      status: sponsorInquiries.status,
      message: sponsorInquiries.message,
      createdAt: sponsorInquiries.createdAt,
      sponsorEmail: users.email,
      sponsorName: users.name
    })
    .from(sponsorInquiries)
    .innerJoin(teams, eq(sponsorInquiries.teamId, teams.id))
    .innerJoin(users, eq(sponsorInquiries.sponsorUserId, users.id))
    .where(
      and(
        eq(sponsorInquiries.teamId, teamId),
        eq(sponsorInquiries.status, "pending")
      )
    )
    .orderBy(desc(sponsorInquiries.createdAt));
}
