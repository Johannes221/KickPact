"use server";

import { requireUserOrThrow } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { createInvitation, listInvitationsForTeam } from "@/lib/db/queries/invitations";

/**
 * Liefert den (Sponsor-)Einladungs-Token der Mannschaft — erstellt einen frischen,
 * falls kein offener existiert. Nur Trainer/Admin der Mannschaft dürfen das.
 */
export async function ensureSponsorInviteLink(
  teamId: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const user = await requireUserOrThrow();
  const access = await resolveTeamAccess(user.id, teamId, "viewer");
  // Einladen dürfen nur admin/trainer — konsistent mit dem canInvite-Gate der
  // Page. (Team-Scope kennt nur admin/viewer, Club-Scope admin/trainer/viewer.)
  if (!access.granted || (access.role !== "admin" && access.role !== "trainer")) {
    return { ok: false, error: "Nur Trainer oder Admins können Sponsoren einladen." };
  }

  const existing = await listInvitationsForTeam(teamId);
  const pending = existing.find((i) => i.status === "pending");
  if (pending) return { ok: true, token: pending.token };

  const inv = await createInvitation({ teamId, createdByUserId: user.id });
  return { ok: true, token: inv.token };
}
