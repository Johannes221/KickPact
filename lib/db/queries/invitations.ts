import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations } from "@/lib/db/schema/invitations";
import { teams } from "@/lib/db/schema/clubs";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createInvitation(args: { teamId: string; createdByUserId: string }) {
  const token = generateToken();
  const [row] = await db
    .insert(sponsorInvitations)
    .values({ teamId: args.teamId, createdByUserId: args.createdByUserId, token })
    .returning();
  return row;
}

export async function findInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(sponsorInvitations)
    .where(eq(sponsorInvitations.token, token))
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
