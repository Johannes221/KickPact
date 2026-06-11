"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  countClubAdmins,
  countTeamAdmins,
  getClubMembershipRole,
  getTeamMembershipRole,
  revokeClubMembership,
  revokeTeamMembership
} from "@/lib/db/queries/membership-requests";

/**
 * B5 (Audit 2026-06-11 / Phase 4 Paket B): Self-Service-Austritt.
 *
 * Mitglieder können ihren Verein bzw. ihre Mannschaft selbst verlassen
 * (Konto-Seite) — bisher ging das nur über einen Admin (revoke auf der
 * Mitglieder-Seite, die Nicht-Admins gar nicht sehen).
 *
 * Guard: Der LETZTE Admin darf nicht austreten, sonst ist der Verein/die
 * Mannschaft unverwaltbar (gleiche Regel wie der Self-Demotion-Guard in
 * einstellungen/mitglieder/_actions/manage.ts). Es wird IMMER nur die eigene
 * Membership-Row entfernt (Self-Scope via requireUser).
 */

export type LeaveMembershipResult =
  | { ok: true }
  | { ok: false; message: string };

const LAST_CLUB_ADMIN_MESSAGE =
  "Du bist der letzte Admin dieses Vereins — Austritt nicht möglich. Befördere zuerst eine andere Person zum Admin.";
const LAST_TEAM_ADMIN_MESSAGE =
  "Du bist der letzte Admin dieser Mannschaft — Austritt nicht möglich. Befördere zuerst eine andere Person zum Admin.";
const NOT_A_MEMBER_MESSAGE = "Keine Mitgliedschaft gefunden.";

const clubSchema = z.object({ clubId: z.string().min(1) });

export async function leaveClubMembershipAction(input: {
  clubId: string;
}): Promise<LeaveMembershipResult> {
  const parsed = clubSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  const user = await requireUser();

  const role = await getClubMembershipRole(parsed.data.clubId, user.id);
  if (!role) return { ok: false, message: NOT_A_MEMBER_MESSAGE };

  if (role === "admin") {
    const adminCount = await countClubAdmins(parsed.data.clubId);
    if (adminCount <= 1) {
      return { ok: false, message: LAST_CLUB_ADMIN_MESSAGE };
    }
  }

  const deleted = await revokeClubMembership(parsed.data.clubId, user.id);
  if (!deleted) return { ok: false, message: NOT_A_MEMBER_MESSAGE };

  revalidatePath("/konto");
  return { ok: true };
}

const teamSchema = z.object({ teamId: z.string().min(1) });

export async function leaveTeamMembershipAction(input: {
  teamId: string;
}): Promise<LeaveMembershipResult> {
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  const user = await requireUser();

  const role = await getTeamMembershipRole(parsed.data.teamId, user.id);
  if (!role) return { ok: false, message: NOT_A_MEMBER_MESSAGE };

  if (role === "admin") {
    const adminCount = await countTeamAdmins(parsed.data.teamId);
    if (adminCount <= 1) {
      return { ok: false, message: LAST_TEAM_ADMIN_MESSAGE };
    }
  }

  const deleted = await revokeTeamMembership(parsed.data.teamId, user.id);
  if (!deleted) return { ok: false, message: NOT_A_MEMBER_MESSAGE };

  revalidatePath("/konto");
  return { ok: true };
}
