"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import {
  createTeamMemberInvitation,
  revokeTeamMemberInvitation,
  refreshTeamMemberInvitation
} from "@/lib/db/queries/invitations";

const inviteSchema = z.object({
  clubSlug: z.string().min(1),
  email: z.string().email("Bitte eine gültige E-Mail eingeben."),
  role: z.enum(["trainer", "viewer"]),
  /** Optional: leer/null = Verein-weite Membership, sonst Team-spezifisch. */
  teamId: z.string().min(1).optional().nullable()
});

export type InviteTeamMemberInput = z.infer<typeof inviteSchema>;

export type InviteTeamMemberResult =
  | { ok: true; token: string; inviteUrl: string }
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
  if (parsed.data.teamId) {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.id, parsed.data.teamId), eq(teams.clubId, club.id)))
      .limit(1);
    if (!team) {
      return { ok: false, error: "Mannschaft nicht gefunden oder nicht zu diesem Verein gehörend." };
    }
    teamIdForInvite = team.id;
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

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true, token: invite.token, inviteUrl };
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
