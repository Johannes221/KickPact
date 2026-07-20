"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getClubBySlug } from "@/lib/db/queries/club-admin";
import { sendRequesterMail } from "@/lib/mail/access-request-mail";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

/**
 * Operator-Pendant zu approveRequestAction/rejectRequestAction
 * (app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts).
 *
 * Nutzt bewusst assertPlatformAdmin() statt assertClubAccess() — das umgeht
 * das Subscription-Gate (lib/auth/scope.ts), das einen Club-Admin mit
 * pausiertem/überfälligem Abo blockieren würde. Gleiche Business-Logik
 * (approveRequest/rejectRequest, gleicher Cross-Tenant-Team-Guard, gleiche
 * Antragsteller-Mail) wie der normale Flow — zusätzlich Audit-Log.
 */

const approveSchema = z.object({ requestId: z.string().min(1), clubSlug: z.string().min(1) });
const rejectSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1),
  reason: z.string().max(280).optional()
});

export async function adminApproveRequestAction(input: { requestId: string; clubSlug: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const club = await getClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }
  // Cross-Tenant-Guard: requestedTeamId ist client-kontrolliert (1:1 aus dem
  // Club-seitigen Flow übernommen) — Team muss zum Verein der Anfrage gehören.
  if (req.requestedTeamId && !(await getTeamInClub(req.requestedTeamId, club.id))) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  try {
    await approveRequest({
      requestId: req.id,
      respondedByUserId: admin.id,
      beforeCommit: () =>
        sendRequesterMail(req.userId, () => {
          const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
          const homeUrl = req.requestedTeamId
            ? `${base}/verein/${club.slug}/mannschaft/${req.requestedTeamId}`
            : `${base}/verein/${club.slug}`;
          const scopeLabel = req.requestedTeamId ? "Mannschafts-Zugriff" : "Vereins-Zugriff";
          return accessRequestApprovedEmail({
            clubName: club.name,
            requestedRole: req.requestedRole,
            scopeLabel,
            homeUrl
          });
        })
    });
  } catch {
    return {
      ok: false as const,
      error: "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.membership_request_approve",
    targetType: "membership",
    targetId: req.id,
    summary: `Zugriffsanfrage angenommen: ${req.requestedRole} für ${club.name} (${req.userId})`
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}

export async function adminRejectRequestAction(input: {
  requestId: string;
  clubSlug: string;
  reason?: string;
}) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const club = await getClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  try {
    await rejectRequest({
      requestId: req.id,
      respondedByUserId: admin.id,
      reason: parsed.data.reason,
      beforeCommit: () =>
        sendRequesterMail(req.userId, () =>
          accessRequestRejectedEmail({
            clubName: club.name,
            reason: parsed.data.reason ?? null
          })
        )
    });
  } catch {
    return {
      ok: false as const,
      error: "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.membership_request_reject",
    targetType: "membership",
    targetId: req.id,
    summary: `Zugriffsanfrage abgelehnt: ${req.requestedRole} für ${club.name} (${req.userId})`,
    diff: parsed.data.reason ? { reason: parsed.data.reason } : null
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}
