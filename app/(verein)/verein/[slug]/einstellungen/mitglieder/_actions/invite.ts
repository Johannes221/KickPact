"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  createTeamMemberInvitation,
  revokeTeamMemberInvitation,
  refreshTeamMemberInvitation
} from "@/lib/db/queries/invitations";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { sendTeamEinladungMail } from "@/lib/mail/send-team-einladung";

const inviteSchema = z.object({
  clubSlug: z.string().min(1),
  email: z.string().email("Bitte eine gültige E-Mail eingeben."),
  role: z.enum(["trainer", "viewer"]),
  /** Optional: leer/null = Verein-weite Membership, sonst Team-spezifisch. */
  teamId: z.string().min(1).optional().nullable()
});

// Param-Typ bewusst breit (role: string), damit das generische InviteForm
// (das role als string liefert) zuweisbar bleibt. Zod validiert zur Laufzeit.
export interface InviteTeamMemberInput {
  clubSlug: string;
  email: string;
  role: string;
  teamId?: string | null;
}

export type InviteTeamMemberResult =
  | { ok: true; token: string; inviteUrl: string; mailSent: boolean }
  | { ok: false; error: string };

export async function inviteTeamMemberAction(
  input: InviteTeamMemberInput
): Promise<InviteTeamMemberResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: first?.message ?? "Ungültige Eingabe" };
  }
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  let teamIdForInvite: string | undefined;
  let teamName: string | null = null;
  if (parsed.data.teamId) {
    const team = await getTeamInClub(parsed.data.teamId, club.id);
    if (!team) {
      return { ok: false, error: "Mannschaft nicht gefunden oder nicht zu diesem Verein gehörend." };
    }
    teamIdForInvite = team.id;
    teamName = team.name;
  }

  const invite = await createTeamMemberInvitation({
    createdByUserId: admin.id,
    role: parsed.data.role,
    teamId: teamIdForInvite,
    clubId: teamIdForInvite ? undefined : club.id,
    recipientEmail: parsed.data.email
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${base}/team-einladung/${invite.token}`;

  // B4 (Audit 2026-06-11): Einladung per Mail verschicken. Ein Mail-Fehler ist
  // nicht fatal — der Link bleibt gültig, die UI bietet den Copy-Fallback an.
  const mailSent = await sendTeamEinladungMail({
    to: parsed.data.email,
    clubName: club.name,
    teamName,
    role: parsed.data.role,
    inviteUrl
  });

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true, token: invite.token, inviteUrl, mailSent };
}

const idSchema = z.object({
  clubSlug: z.string().min(1),
  invitationId: z.string().min(1)
});

export type InvitationActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function revokeTeamMemberInvitationAction(
  input: z.infer<typeof idSchema>
): Promise<InvitationActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };

  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");
  try {
    await revokeTeamMemberInvitation(parsed.data.invitationId, club.id);
  } catch {
    return { ok: false, error: "Einladung konnte nicht widerrufen werden." };
  }
  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
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

  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");
  try {
    const { token } = await refreshTeamMemberInvitation(
      parsed.data.invitationId,
      club.id
    );
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
    return { ok: true, inviteUrl: `${base}/team-einladung/${token}` };
  } catch {
    return { ok: false, error: "Einladung konnte nicht erneuert werden." };
  }
}
