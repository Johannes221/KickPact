import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations } from "@/lib/db/schema/invitations";
import { teams } from "@/lib/db/schema/clubs";

const INVITATION_TTL_DAYS = 30;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createInvitation(args: {
  teamId: string;
  createdByUserId: string;
  recipientName?: string;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(sponsorInvitations)
    .values({
      teamId: args.teamId,
      createdByUserId: args.createdByUserId,
      token,
      recipientName: args.recipientName ?? null,
      expiresAt
    })
    .returning();
  return row;
}

/**
 * Liefert eine Invitation NUR wenn sie noch verwendbar ist:
 * status='pending' UND expiresAt > now. Bereits genutzte (`used`),
 * widerrufene (`revoked`) oder abgelaufene Tokens → NULL.
 *
 * Aufrufer (z.B. /api/squad) dürfen sich darauf verlassen, dass ein
 * non-null Result einen einlösbaren Token bedeutet.
 */
export async function findInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(sponsorInvitations)
    .where(
      and(
        eq(sponsorInvitations.token, token),
        eq(sponsorInvitations.status, "pending"),
        gt(sponsorInvitations.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

export async function markInvitationUsed(token: string, usedByUserId: string) {
  await db
    .update(sponsorInvitations)
    .set({ status: "used", usedAt: new Date(), usedByUserId })
    .where(eq(sponsorInvitations.token, token));
}

export async function listInvitationsForTeam(teamId: string) {
  return db
    .select()
    .from(sponsorInvitations)
    .where(eq(sponsorInvitations.teamId, teamId))
    .orderBy(sql`${sponsorInvitations.createdAt} desc`);
}

export async function revokeInvitation(invitationId: string, clubId: string) {
  // Tenant-Check: invitation -> team -> club
  const [target] = await db
    .select({
      invId: sponsorInvitations.id,
      teamClubId: teams.clubId
    })
    .from(sponsorInvitations)
    .innerJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .where(eq(sponsorInvitations.id, invitationId))
    .limit(1);
  if (!target || target.teamClubId !== clubId) {
    throw new Error("Invitation nicht gefunden oder nicht autorisiert");
  }
  await db
    .update(sponsorInvitations)
    .set({ status: "revoked" })
    .where(eq(sponsorInvitations.id, invitationId));
}
