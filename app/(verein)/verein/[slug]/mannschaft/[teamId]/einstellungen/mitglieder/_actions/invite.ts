"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { canManageTeamMembers } from "@/lib/auth/scope";
import {
  createTeamMemberInvitation,
  getTeamMemberInvitationTeamId,
  revokeTeamInvitationForTeam,
  refreshTeamInvitationForTeam
} from "@/lib/db/queries/invitations";

const NO_PERMISSION = "Keine Berechtigung für diese Mannschaft.";

function mitgliederPath(clubSlug: string, teamId: string) {
  return `/verein/${clubSlug}/mannschaft/${teamId}/einstellungen/mitglieder`;
}

// Breiter Param-Typ (role: string), passend zur generischen InviteForm.
// Zod validiert auf admin|viewer (Team-Scope).
const inviteSchema = z.object({
  clubSlug: z.string().min(1),
  email: z.string().email("Bitte eine gültige E-Mail eingeben."),
  role: z.enum(["admin", "viewer"]),
  teamId: z.string().min(1).nullable()
});

export interface TeamInviteInput {
  clubSlug: string;
  email: string;
  role: string;
  teamId: string | null;
}

export type TeamInviteResult =
  | { ok: true; token: string; inviteUrl: string }
  | { ok: false; error: string };

export async function inviteTeamMemberAction(
  input: TeamInviteInput
): Promise<TeamInviteResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: first?.message ?? "Ungültige Eingabe" };
  }
  const { clubSlug, email, role, teamId } = parsed.data;
  if (!teamId) return { ok: false, error: "Mannschaft fehlt." };

  const user = await requireUser();
  if (!(await canManageTeamMembers(user.id, teamId))) {
    return { ok: false, error: NO_PERMISSION };
  }

  const invite = await createTeamMemberInvitation({
    createdByUserId: user.id,
    role,
    teamId,
    recipientEmail: email
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${base}/team-einladung/${invite.token}`;
  revalidatePath(mitgliederPath(clubSlug, teamId));
  return { ok: true, token: invite.token, inviteUrl };
}

const idSchema = z.object({
  clubSlug: z.string().min(1),
  invitationId: z.string().min(1)
});

export type InvitationActionResult = { ok: true } | { ok: false; error: string };

export async function revokeTeamMemberInvitationAction(
  input: z.infer<typeof idSchema>
): Promise<InvitationActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };

  const teamId = await getTeamMemberInvitationTeamId(parsed.data.invitationId);
  if (!teamId) return { ok: false, error: "Einladung nicht gefunden." };

  const user = await requireUser();
  if (!(await canManageTeamMembers(user.id, teamId))) {
    return { ok: false, error: NO_PERMISSION };
  }
  try {
    await revokeTeamInvitationForTeam(parsed.data.invitationId, teamId);
  } catch {
    return { ok: false, error: "Einladung konnte nicht widerrufen werden." };
  }
  revalidatePath(mitgliederPath(parsed.data.clubSlug, teamId));
  return { ok: true };
}

export type RefreshInvitationResult =
  | { ok: true; inviteUrl: string }
  | { ok: false; error: string };

export async function refreshTeamMemberInvitationAction(
  input: z.infer<typeof idSchema>
): Promise<RefreshInvitationResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };

  const teamId = await getTeamMemberInvitationTeamId(parsed.data.invitationId);
  if (!teamId) return { ok: false, error: "Einladung nicht gefunden." };

  const user = await requireUser();
  if (!(await canManageTeamMembers(user.id, teamId))) {
    return { ok: false, error: NO_PERMISSION };
  }
  try {
    const { token } = await refreshTeamInvitationForTeam(parsed.data.invitationId, teamId);
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    revalidatePath(mitgliederPath(parsed.data.clubSlug, teamId));
    return { ok: true, inviteUrl: `${base}/team-einladung/${token}` };
  } catch {
    return { ok: false, error: "Einladung konnte nicht erneuert werden." };
  }
}
