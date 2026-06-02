import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubMembershipRequests,
  clubMemberships,
  teamMemberships,
  teams,
  clubs,
  users
} from "@/lib/db/schema";

export type MembershipRequestStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "admin" | "trainer" | "viewer";
export type ClubRole = "admin" | "trainer" | "viewer";
export type TeamRole = "admin" | "viewer";

export interface CreateRequestArgs {
  userId: string;
  clubId: string;
  requestedRole: RequestedRole;
  requestedTeamId: string | null;
  message: string | null;
  isConflictClaim?: boolean;
  conflictDocStorageKey?: string | null;
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
  isConflictClaim: boolean;
  conflictDocStorageKey: string | null;
}

/**
 * Inserts a new pending club-membership request. The partial unique index
 * `club_request_unique_pending_idx` is defined with NULLS NOT DISTINCT
 * (PG 15+) on (userId, clubId, requestedTeamId WHERE status='pending'),
 * so a duplicate open request — including the club-wide case where
 * `requestedTeamId IS NULL` — raises a UNIQUE-violation that we propagate.
 */
export async function createRequest(args: CreateRequestArgs): Promise<MembershipRequest> {
  const [row] = await db
    .insert(clubMembershipRequests)
    .values({
      userId: args.userId,
      clubId: args.clubId,
      requestedRole: args.requestedRole,
      requestedTeamId: args.requestedTeamId,
      message: args.message,
      isConflictClaim: args.isConflictClaim ?? false,
      conflictDocStorageKey: args.conflictDocStorageKey ?? null
    })
    .returning();
  return row as MembershipRequest;
}

export interface MyPendingRequest {
  id: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
  requestedTeamId: string | null;
  requestedTeamName: string | null;
  requestedRole: RequestedRole;
  createdAt: Date;
}

/**
 * Listet die EIGENEN noch offenen (pending) Zugriffs-Anfragen eines Users —
 * für die Rollen-Liste/Dropdown ("Angefragt") und das De-Dupe im Discover-Flow
 * ("Zugriff bereits angefragt"). Mannschaftsname + Club-Slug zum Anzeigen.
 */
export async function listMyPendingRequests(
  userId: string
): Promise<MyPendingRequest[]> {
  const rows = await db
    .select({
      id: clubMembershipRequests.id,
      clubId: clubMembershipRequests.clubId,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      requestedTeamId: clubMembershipRequests.requestedTeamId,
      requestedTeamName: teams.name,
      requestedRole: clubMembershipRequests.requestedRole,
      createdAt: clubMembershipRequests.createdAt
    })
    .from(clubMembershipRequests)
    .innerJoin(clubs, eq(clubMembershipRequests.clubId, clubs.id))
    .leftJoin(teams, eq(clubMembershipRequests.requestedTeamId, teams.id))
    .where(
      and(
        eq(clubMembershipRequests.userId, userId),
        eq(clubMembershipRequests.status, "pending")
      )
    )
    .orderBy(desc(clubMembershipRequests.createdAt));
  return rows as MyPendingRequest[];
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

/**
 * Lists pending requests scoped to a single team (requestedTeamId = teamId),
 * newest first. For the team-scoped Mitglieder inbox.
 */
export async function listPendingRequestsForTeam(teamId: string): Promise<PendingRequestRow[]> {
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
        eq(clubMembershipRequests.requestedTeamId, teamId),
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
 * Team-scope mapping: nur "viewer" bleibt viewer, jede andere angefragte Rolle
 * (admin/trainer) wird zum Mannschaftsadmin. Team-Ebene kennt nur admin|viewer.
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
    // Team-scoped: admin | viewer (alles außer viewer → Mannschaftsadmin)
    const teamRole = req.requestedRole === "viewer" ? "viewer" : "admin";
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

/**
 * Counts the active admins for a given club. Used by the self-demotion guard
 * to prevent the last admin from demoting or revoking themselves and locking
 * the club out.
 */
export async function countClubAdmins(clubId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clubMemberships)
    .where(
      and(
        eq(clubMemberships.clubId, clubId),
        eq(clubMemberships.role, "admin")
      )
    );
  return row?.count ?? 0;
}

/**
 * Counts the team admins for a given team. Used by the last-admin guard on the
 * team-scoped Mitglieder page: the last team admin of an AUTARK team must not
 * be demoted/revoked, otherwise the team would be unmanageable (no club
 * durchgriff to fall back on).
 */
export async function countTeamAdmins(teamId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMemberships)
    .where(
      and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.role, "admin")
      )
    );
  return row?.count ?? 0;
}

/**
 * Updates a club-level membership role for a given user. No-ops cleanly when
 * the membership row does not exist (returns null).
 */
export async function changeClubMembershipRole(
  clubId: string,
  userId: string,
  newRole: ClubRole
): Promise<{ userId: string; clubId: string; role: ClubRole } | null> {
  const [updated] = await db
    .update(clubMemberships)
    .set({ role: newRole })
    .where(
      and(
        eq(clubMemberships.clubId, clubId),
        eq(clubMemberships.userId, userId)
      )
    )
    .returning();
  if (!updated) return null;
  return {
    userId: updated.userId,
    clubId: updated.clubId,
    role: updated.role as ClubRole
  };
}

/**
 * Removes a club-level membership row entirely. Returns true if a row was
 * deleted, false if nothing matched.
 */
export async function revokeClubMembership(
  clubId: string,
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(clubMemberships)
    .where(
      and(
        eq(clubMemberships.clubId, clubId),
        eq(clubMemberships.userId, userId)
      )
    )
    .returning({ userId: clubMemberships.userId });
  return deleted.length > 0;
}

/**
 * Returns the current team-membership role for a user, or null if none.
 * Used by the last-team-admin guard to decide whether a demote/revoke would
 * remove the sole admin.
 */
export async function getTeamMembershipRole(
  teamId: string,
  userId: string
): Promise<TeamRole | null> {
  const [row] = await db
    .select({ role: teamMemberships.role })
    .from(teamMemberships)
    .where(
      and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.userId, userId)
      )
    )
    .limit(1);
  return (row?.role as TeamRole | undefined) ?? null;
}

/**
 * Updates a team-level membership role for a given user.
 */
export async function changeTeamMembershipRole(
  teamId: string,
  userId: string,
  newRole: TeamRole
): Promise<{ userId: string; teamId: string; role: TeamRole } | null> {
  const [updated] = await db
    .update(teamMemberships)
    .set({ role: newRole })
    .where(
      and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.userId, userId)
      )
    )
    .returning();
  if (!updated) return null;
  return {
    userId: updated.userId,
    teamId: updated.teamId,
    role: updated.role as TeamRole
  };
}

/**
 * Removes a team-level membership row entirely. Returns true if a row was
 * deleted, false if nothing matched.
 */
export async function revokeTeamMembership(
  teamId: string,
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(teamMemberships)
    .where(
      and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.userId, userId)
      )
    )
    .returning({ userId: teamMemberships.userId });
  return deleted.length > 0;
}
