import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  clubMemberships,
  teamMemberships,
  sponsors,
  pledges,
  users
} from "@/lib/db/schema";

function uniq(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

/** Admins eines Clubs (role = 'admin'). */
export async function getClubAdminUserIds(clubId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: clubMemberships.userId })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.role, "admin")));
  return uniq(rows.map((r) => r.userId));
}

/** E-Mail-Adressen der Club-Admins (role = 'admin') — für Admin-Benachrichtigungen. */
export async function listClubAdminEmails(clubId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.role, "admin")));
  return rows.map((r) => r.email);
}

/** Admins einer Mannschaft (team_memberships role = 'admin'). */
export async function getTeamAdminUserIds(teamId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: teamMemberships.userId })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.role, "admin")));
  return uniq(rows.map((r) => r.userId));
}

/**
 * Aktive Sponsoren (deren `userId`) einer Mannschaft — über aktive Pledges.
 */
export async function getActiveSponsorUserIdsForTeam(teamId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: sponsors.userId })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(and(eq(pledges.teamId, teamId), eq(pledges.status, "active")));
  return uniq(rows.map((r) => r.userId));
}

/**
 * Empfänger für Team-bezogene Benachrichtigungen (z.B. neues Spielergebnis):
 * alle Mannschafts-Mitglieder + die Club-Admins/Trainer des zugehörigen Clubs +
 * alle aktiven Sponsoren des Teams.
 */
export async function getTeamNotificationRecipients(teamId: string): Promise<string[]> {
  const { memberUserIds, sponsorUserIds } =
    await getTeamNotificationRecipientsSplit(teamId);
  return uniq([...memberUserIds, ...sponsorUserIds]);
}

/**
 * Wie `getTeamNotificationRecipients`, aber getrennt nach Vereins-Seite
 * (Team-Mitglieder + Club-Admins/Trainer) und aktiven Sponsoren — für
 * unterschiedliche Deep-Links (A1: Sponsoren dürfen nicht auf die interne
 * Vereins-Route gelinkt werden, deren Guard sie bounced).
 */
export async function getTeamNotificationRecipientsSplit(
  teamId: string
): Promise<{ memberUserIds: string[]; sponsorUserIds: string[] }> {
  const [teamRow] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const teamMembers = await db
    .select({ userId: teamMemberships.userId })
    .from(teamMemberships)
    .where(eq(teamMemberships.teamId, teamId));

  let clubStaff: { userId: string }[] = [];
  if (teamRow?.clubId) {
    clubStaff = await db
      .select({ userId: clubMemberships.userId })
      .from(clubMemberships)
      .where(
        and(
          eq(clubMemberships.clubId, teamRow.clubId),
          inArray(clubMemberships.role, ["admin", "trainer"])
        )
      );
  }

  const sponsorUserIds = await getActiveSponsorUserIdsForTeam(teamId);

  return {
    memberUserIds: uniq([
      ...teamMembers.map((r) => r.userId),
      ...clubStaff.map((r) => r.userId)
    ]),
    sponsorUserIds: uniq(sponsorUserIds)
  };
}
