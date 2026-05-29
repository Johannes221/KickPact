"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { canManageTeamMembers } from "@/lib/auth/scope";
import {
  changeTeamMembershipRole,
  revokeTeamMembership,
  countTeamAdmins,
  getTeamMembershipRole
} from "@/lib/db/queries/membership-requests";

type ActionResult = { ok: true } | { ok: false; error: string };

const NO_PERMISSION = "Keine Berechtigung für diese Mannschaft.";
const LAST_ADMIN =
  "Letzter Mannschaftsadmin — befördere zuerst eine andere Person.";

function mitgliederPath(clubSlug: string, teamId: string) {
  return `/verein/${clubSlug}/mannschaft/${teamId}/einstellungen/mitglieder`;
}

// Geteilte discriminated-Signatur (vgl. members-table.tsx ChangeRoleInput).
// Die Team-Seite emittiert nur scope:"team"; scope:"club" wird abgelehnt.
const changeRoleSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("club"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1),
    newRole: z.enum(["admin", "trainer", "viewer"])
  }),
  z.object({
    scope: z.literal("team"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1),
    teamId: z.string().min(1),
    newRole: z.enum(["admin", "viewer"])
  })
]);

const revokeSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("club"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1)
  }),
  z.object({
    scope: z.literal("team"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1),
    teamId: z.string().min(1)
  })
]);

export async function changeRoleAction(
  input: z.infer<typeof changeRoleSchema>
): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };
  if (parsed.data.scope !== "team") {
    return { ok: false, error: "Nur Team-Mitglieder verwaltbar." };
  }
  const { clubSlug, teamId, targetUserId, newRole } = parsed.data;

  const user = await requireUser();
  if (!(await canManageTeamMembers(user.id, teamId))) {
    return { ok: false, error: NO_PERMISSION };
  }

  if (newRole === "viewer") {
    const current = await getTeamMembershipRole(teamId, targetUserId);
    if (current === "admin" && (await countTeamAdmins(teamId)) <= 1) {
      return { ok: false, error: LAST_ADMIN };
    }
  }

  const updated = await changeTeamMembershipRole(teamId, targetUserId, newRole);
  if (!updated) return { ok: false, error: "Mitgliedschaft nicht gefunden" };

  revalidatePath(mitgliederPath(clubSlug, teamId));
  return { ok: true };
}

export async function revokeAction(
  input: z.infer<typeof revokeSchema>
): Promise<ActionResult> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };
  if (parsed.data.scope !== "team") {
    return { ok: false, error: "Nur Team-Mitglieder verwaltbar." };
  }
  const { clubSlug, teamId, targetUserId } = parsed.data;

  const user = await requireUser();
  if (!(await canManageTeamMembers(user.id, teamId))) {
    return { ok: false, error: NO_PERMISSION };
  }

  const current = await getTeamMembershipRole(teamId, targetUserId);
  if (current === "admin" && (await countTeamAdmins(teamId)) <= 1) {
    return { ok: false, error: LAST_ADMIN };
  }

  const ok = await revokeTeamMembership(teamId, targetUserId);
  if (!ok) return { ok: false, error: "Mitgliedschaft nicht gefunden" };

  revalidatePath(mitgliederPath(clubSlug, teamId));
  return { ok: true };
}
