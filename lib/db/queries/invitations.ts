import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations } from "@/lib/db/schema/invitations";
import { teams, clubMemberships, teamMemberships } from "@/lib/db/schema/clubs";

const INVITATION_TTL_DAYS = 30;

export type InvitationKind = "sponsor" | "team-member";
export type InvitationRole = "trainer" | "viewer";

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
      kind: "sponsor",
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
 * Erzeugt einen `team-member`-Invite (Trainer oder Viewer). Genau eins von
 * teamId / clubId muss gesetzt sein:
 *  - `teamId` → Team-Membership wird angelegt
 *  - `clubId` → Club-Membership wird angelegt (Verein-weite Rolle)
 *
 * `role`: `trainer` | `viewer`. `admin` wird bewusst NICHT via Invite
 * vergeben — Admin-Erhebung läuft über die Mitglieder-Tabelle.
 */
export async function createTeamMemberInvitation(args: {
  createdByUserId: string;
  role: InvitationRole;
  teamId?: string;
  clubId?: string;
  recipientEmail?: string;
  recipientName?: string;
}) {
  if (!args.teamId && !args.clubId) {
    throw new Error("createTeamMemberInvitation: teamId oder clubId muss gesetzt sein");
  }
  if (args.teamId && args.clubId) {
    throw new Error("createTeamMemberInvitation: nur teamId ODER clubId, nicht beides");
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(sponsorInvitations)
    .values({
      kind: "team-member",
      teamId: args.teamId ?? null,
      clubId: args.clubId ?? null,
      role: args.role,
      createdByUserId: args.createdByUserId,
      token,
      recipientName: args.recipientName ?? null,
      recipientEmail: args.recipientEmail ?? null,
      expiresAt
    })
    .returning();
  return row;
}

/**
 * Sucht eine `team-member`-Invitation, nur wenn pending UND nicht abgelaufen.
 * Liefert `null` für ungültige Tokens.
 */
export async function findTeamMemberInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(sponsorInvitations)
    .where(
      and(
        eq(sponsorInvitations.token, token),
        eq(sponsorInvitations.kind, "team-member"),
        eq(sponsorInvitations.status, "pending"),
        gt(sponsorInvitations.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Löst einen `team-member`-Invite ein: legt die passende Membership an
 * (`teamMemberships` bei teamId, `clubMemberships` bei clubId) und markiert
 * den Token als used.
 *
 * Idempotent: existiert die Membership schon, wird der Token trotzdem als
 * used markiert (kein Double-Spend).
 *
 * Wirft, wenn der Invite ungültig / abgelaufen / nicht vom kind `team-member`.
 */
export async function acceptTeamMemberInvitation(args: {
  token: string;
  userId: string;
}): Promise<{ scope: "club" | "team"; clubId?: string; teamId?: string; role: InvitationRole }> {
  const invite = await findTeamMemberInvitationByToken(args.token);
  if (!invite) {
    throw new Error("Einladung ungültig oder abgelaufen");
  }
  if (!invite.role) {
    throw new Error("Einladungs-Rolle fehlt");
  }

  if (invite.teamId) {
    await db
      .insert(teamMemberships)
      .values({
        userId: args.userId,
        teamId: invite.teamId,
        role: invite.role,
        invitedByUserId: invite.createdByUserId
      })
      .onConflictDoNothing();
    await db
      .update(sponsorInvitations)
      .set({ status: "used", usedAt: new Date(), usedByUserId: args.userId })
      .where(eq(sponsorInvitations.token, args.token));
    return { scope: "team", teamId: invite.teamId, role: invite.role };
  }

  if (invite.clubId) {
    await db
      .insert(clubMemberships)
      .values({
        userId: args.userId,
        clubId: invite.clubId,
        role: invite.role
      })
      .onConflictDoNothing();
    await db
      .update(sponsorInvitations)
      .set({ status: "used", usedAt: new Date(), usedByUserId: args.userId })
      .where(eq(sponsorInvitations.token, args.token));
    return { scope: "club", clubId: invite.clubId, role: invite.role };
  }

  throw new Error("Einladung hat weder team_id noch club_id");
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
        eq(sponsorInvitations.kind, "sponsor"),
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
