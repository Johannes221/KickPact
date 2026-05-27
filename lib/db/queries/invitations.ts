import { randomBytes } from "node:crypto";
import { and, eq, gt, or, sql } from "drizzle-orm";
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

// ─────────────────────────────────────────────────────────────────────────────
// Team-Member Invitations (Pending-Inbox + Revoke + Refresh)
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingTeamMemberInvitation {
  id: string;
  token: string;
  recipientEmail: string | null;
  role: "trainer" | "viewer";
  /** null = Verein-weite Einladung */
  teamId: string | null;
  teamName: string | null;
  clubId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Alle offenen (pending, nicht abgelaufenen) team-member-Einladungen eines
 * Vereins — egal ob Verein-weit (clubId) oder Mannschafts-spezifisch (teamId).
 * Neueste zuerst.
 */
export async function listPendingTeamMemberInvitationsForClub(
  clubId: string
): Promise<PendingTeamMemberInvitation[]> {
  const rows = await db
    .select({
      id: sponsorInvitations.id,
      token: sponsorInvitations.token,
      recipientEmail: sponsorInvitations.recipientEmail,
      role: sponsorInvitations.role,
      teamId: sponsorInvitations.teamId,
      teamName: teams.name,
      clubId: sponsorInvitations.clubId,
      createdAt: sponsorInvitations.createdAt,
      expiresAt: sponsorInvitations.expiresAt
    })
    .from(sponsorInvitations)
    .leftJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .where(
      and(
        eq(sponsorInvitations.kind, "team-member"),
        eq(sponsorInvitations.status, "pending"),
        gt(sponsorInvitations.expiresAt, new Date()),
        or(
          eq(sponsorInvitations.clubId, clubId),
          eq(teams.clubId, clubId)
        )
      )
    )
    .orderBy(sql`${sponsorInvitations.createdAt} desc`);

  return rows.map((r) => ({
    ...r,
    role: (r.role ?? "viewer") as "trainer" | "viewer"
  }));
}

/**
 * Widerruft eine team-member-Einladung. Tenant-Check: die Einladung muss
 * zu diesem Club gehören (entweder direkt über clubId oder via team.clubId).
 */
export async function revokeTeamMemberInvitation(
  invitationId: string,
  clubId: string
): Promise<void> {
  // Verify the invitation belongs to this club
  const [row] = await db
    .select({
      id: sponsorInvitations.id,
      invClubId: sponsorInvitations.clubId,
      teamClubId: teams.clubId
    })
    .from(sponsorInvitations)
    .leftJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .where(
      and(
        eq(sponsorInvitations.id, invitationId),
        eq(sponsorInvitations.kind, "team-member")
      )
    )
    .limit(1);

  if (
    !row ||
    (row.invClubId !== clubId && row.teamClubId !== clubId)
  ) {
    throw new Error("Einladung nicht gefunden oder nicht autorisiert");
  }

  await db
    .update(sponsorInvitations)
    .set({ status: "revoked" })
    .where(eq(sponsorInvitations.id, invitationId));
}

/**
 * Verlängert eine team-member-Einladung um weitere 30 Tage (Refresh-Token).
 * Legt einen neuen Token an und revokiert den alten — damit alte Links nicht
 * mehr gültig sind. Gibt die neue Einladung zurück.
 */
export async function refreshTeamMemberInvitation(
  invitationId: string,
  clubId: string
): Promise<{ token: string }> {
  const [existing] = await db
    .select({
      id: sponsorInvitations.id,
      invClubId: sponsorInvitations.clubId,
      teamId: sponsorInvitations.teamId,
      teamClubId: teams.clubId,
      role: sponsorInvitations.role,
      createdByUserId: sponsorInvitations.createdByUserId,
      recipientEmail: sponsorInvitations.recipientEmail,
      recipientName: sponsorInvitations.recipientName
    })
    .from(sponsorInvitations)
    .leftJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .where(
      and(
        eq(sponsorInvitations.id, invitationId),
        eq(sponsorInvitations.kind, "team-member"),
        eq(sponsorInvitations.status, "pending")
      )
    )
    .limit(1);

  if (
    !existing ||
    (existing.invClubId !== clubId && existing.teamClubId !== clubId)
  ) {
    throw new Error("Einladung nicht gefunden oder nicht autorisiert");
  }

  // Revoke old
  await db
    .update(sponsorInvitations)
    .set({ status: "revoked" })
    .where(eq(sponsorInvitations.id, invitationId));

  // Create fresh
  const newToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sponsorInvitations).values({
    kind: "team-member",
    teamId: existing.teamId ?? null,
    clubId: existing.invClubId ?? null,
    role: existing.role,
    createdByUserId: existing.createdByUserId,
    recipientEmail: existing.recipientEmail ?? null,
    recipientName: existing.recipientName ?? null,
    token: newToken,
    expiresAt
  });

  return { token: newToken };
}
