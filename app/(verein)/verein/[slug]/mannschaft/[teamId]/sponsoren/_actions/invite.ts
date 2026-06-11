"use server";

import { requireUserOrThrow } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import {
  createInvitation,
  getTeamContainerVerifiedAt,
  listInvitationsForTeam
} from "@/lib/db/queries/invitations";
import { getTeamBasicById } from "@/lib/db/queries/team-lifecycle";
import { getTeamLicensePlanDirect } from "@/lib/db/queries/subscriptions";

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

  // B9 (Audit 2026-06-11): Verifikations-Gate SERVERSEITIG erzwingen — wie das
  // Club-Pendant (sponsoren/_actions/invitations.ts). Scope analog der
  // Sponsoren-Page: Vereinslizenz verifiziert den Verein (Teams erben),
  // Einzel-Mannschaft (basic/pro) verifiziert sich selbst.
  const [licenseRow, team, clubVerifiedAt] = await Promise.all([
    getTeamLicensePlanDirect(teamId),
    getTeamBasicById(teamId),
    getTeamContainerVerifiedAt(teamId)
  ]);
  const isVerified =
    licenseRow?.plan === "verein" ? !!clubVerifiedAt : !!team?.verifiedAt;
  if (!isVerified) {
    return {
      ok: false,
      error:
        licenseRow?.plan === "verein"
          ? "Bitte zuerst den Verein verifizieren — dann kannst du Sponsoren einladen."
          : "Bitte zuerst die Mannschaft verifizieren — dann kannst du Sponsoren einladen."
    };
  }

  const existing = await listInvitationsForTeam(teamId);
  const pending = existing.find((i) => i.status === "pending");
  if (pending) return { ok: true, token: pending.token };

  const inv = await createInvitation({ teamId, createdByUserId: user.id });
  return { ok: true, token: inv.token };
}
