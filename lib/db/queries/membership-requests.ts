import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubMembershipRequests,
  clubMemberships,
  teamMemberships,
  teams,
  users
} from "@/lib/db/schema";

export type MembershipRequestStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "admin" | "trainer" | "viewer";

export interface CreateRequestArgs {
  userId: string;
  clubId: string;
  requestedRole: RequestedRole;
  requestedTeamId: string | null;
  message: string | null;
}

export interface MembershipRequest {
  id: string;
  userId: string;
  clubId: string;
  requestedRole: RequestedRole;
  requestedTeamId: string | null;
  message: string | null;
  status: MembershipRequestStatus;
  responseMessage: string | null;
  respondedAt: Date | null;
  respondedByUserId: string | null;
  createdAt: Date;
}

/**
 * Inserts a new pending club-membership request. The partial unique index
 * on (userId, clubId, requestedTeamId WHERE status='pending') makes a
 * second-open request throw a UNIQUE-violation — propagate it.
 *
 * Note: Postgres treats NULLs as distinct in unique indexes by default, so
 * the partial index alone won't catch duplicates when `requestedTeamId` is
 * NULL (club-wide requests). We pre-check explicitly to cover that case;
 * for team-scoped requests the index still does the work.
 */
export async function createRequest(args: CreateRequestArgs): Promise<MembershipRequest> {
  if (args.requestedTeamId === null) {
    const [existing] = await db
      .select({ id: clubMembershipRequests.id })
      .from(clubMembershipRequests)
      .where(
        and(
          eq(clubMembershipRequests.userId, args.userId),
          eq(clubMembershipRequests.clubId, args.clubId),
          isNull(clubMembershipRequests.requestedTeamId),
          eq(clubMembershipRequests.status, "pending")
        )
      )
      .limit(1);
    if (existing) {
      throw new Error(
        `duplicate pending club-wide request for user=${args.userId} club=${args.clubId}`
      );
    }
  }

  const [row] = await db
    .insert(clubMembershipRequests)
    .values({
      userId: args.userId,
      clubId: args.clubId,
      requestedRole: args.requestedRole,
      requestedTeamId: args.requestedTeamId,
      message: args.message
    })
    .returning();
  return row as MembershipRequest;
}

export interface PendingRequestRow extends MembershipRequest {
  requesterEmail: string;
  requestedTeamName: string | null;
}

/**
 * Lists all pending requests for a single club, newest first.
 * Joins requester email and team name for direct display in the admin inbox.
 */
export async function listPendingRequestsForClub(clubId: string): Promise<PendingRequestRow[]> {
  const rows = await db
    .select({
      id: clubMembershipRequests.id,
      userId: clubMembershipRequests.userId,
      clubId: clubMembershipRequests.clubId,
      requestedRole: clubMembershipRequests.requestedRole,
      requestedTeamId: clubMembershipRequests.requestedTeamId,
      message: clubMembershipRequests.message,
      status: clubMembershipRequests.status,
      responseMessage: clubMembershipRequests.responseMessage,
      respondedAt: clubMembershipRequests.respondedAt,
      respondedByUserId: clubMembershipRequests.respondedByUserId,
      createdAt: clubMembershipRequests.createdAt,
      requesterEmail: users.email,
      requestedTeamName: teams.name
    })
    .from(clubMembershipRequests)
    .innerJoin(users, eq(clubMembershipRequests.userId, users.id))
    .leftJoin(teams, eq(clubMembershipRequests.requestedTeamId, teams.id))
    .where(
      and(
        eq(clubMembershipRequests.clubId, clubId),
        eq(clubMembershipRequests.status, "pending")
      )
    )
    .orderBy(desc(clubMembershipRequests.createdAt));

  return rows as PendingRequestRow[];
}

export async function getRequestById(requestId: string): Promise<MembershipRequest | null> {
  const [row] = await db
    .select()
    .from(clubMembershipRequests)
    .where(eq(clubMembershipRequests.id, requestId))
    .limit(1);
  return (row as MembershipRequest | undefined) ?? null;
}

export interface ApproveArgs {
  requestId: string;
  respondedByUserId: string;
}

/**
 * Approves a pending request: creates the matching membership row
 * (clubMemberships for scope=club, teamMemberships for scope=team), then
 * marks the request approved. Returns the updated request.
 *
 * Team-scope mapping: requestedRole "admin" maps to team-level "trainer"
 * (admin doesn't exist at team scope). Other roles pass through directly.
 *
 * No-ops cleanly if the membership already exists (e.g. concurrent approves).
 */
export async function approveRequest(args: ApproveArgs): Promise<MembershipRequest> {
  const req = await getRequestById(args.requestId);
  if (!req) throw new Error(`request not found: ${args.requestId}`);
  if (req.status !== "pending") {
    throw new Error(`request not pending (status=${req.status})`);
  }

  if (req.requestedTeamId) {
    // Team-scoped: trainer | viewer (admin downgrades to trainer)
    const teamRole = req.requestedRole === "viewer" ? "viewer" : "trainer";
    await db
      .insert(teamMemberships)
      .values({
        userId: req.userId,
        teamId: req.requestedTeamId,
        role: teamRole,
        invitedByUserId: args.respondedByUserId
      })
      .onConflictDoNothing();
  } else {
    // Club-wide: admin | trainer | viewer pass through
    await db
      .insert(clubMemberships)
      .values({
        userId: req.userId,
        clubId: req.clubId,
        role: req.requestedRole
      })
      .onConflictDoNothing();
  }

  const [updated] = await db
    .update(clubMembershipRequests)
    .set({
      status: "approved",
      respondedAt: new Date(),
      respondedByUserId: args.respondedByUserId
    })
    .where(eq(clubMembershipRequests.id, req.id))
    .returning();

  return updated as MembershipRequest;
}

export interface RejectArgs {
  requestId: string;
  respondedByUserId: string;
  reason?: string;
}

/**
 * Rejects a pending request: only updates status + responseMessage. No
 * membership row is created.
 */
export async function rejectRequest(args: RejectArgs): Promise<MembershipRequest> {
  const req = await getRequestById(args.requestId);
  if (!req) throw new Error(`request not found: ${args.requestId}`);
  if (req.status !== "pending") {
    throw new Error(`request not pending (status=${req.status})`);
  }

  const [updated] = await db
    .update(clubMembershipRequests)
    .set({
      status: "rejected",
      respondedAt: new Date(),
      respondedByUserId: args.respondedByUserId,
      responseMessage: args.reason ?? null
    })
    .where(eq(clubMembershipRequests.id, req.id))
    .returning();

  return updated as MembershipRequest;
}
