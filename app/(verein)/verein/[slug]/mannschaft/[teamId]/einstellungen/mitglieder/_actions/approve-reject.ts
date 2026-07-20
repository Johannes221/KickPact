"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { canManageTeamMembers } from "@/lib/auth/scope";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getClubById } from "@/lib/db/queries/club-admin";
import { sendRequesterMail } from "@/lib/mail/access-request-mail";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

type ActionResult = { ok: true } | { ok: false; error: string };

const NO_PERMISSION = "Keine Berechtigung für diese Mannschaft.";
const MAIL_FAILED =
  "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen.";

const approveSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1)
});
const rejectSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1),
  reason: z.string().max(280).optional()
});

export async function approveRequestAction(
  input: { requestId: string; clubSlug: string }
): Promise<ActionResult> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };
  const user = await requireUser();

  const req = await getRequestById(parsed.data.requestId);
  if (!req || !req.requestedTeamId) {
    return { ok: false, error: "Anfrage nicht gefunden" };
  }
  if (!(await canManageTeamMembers(user.id, req.requestedTeamId))) {
    return { ok: false, error: NO_PERMISSION };
  }

  try {
    await approveRequest({
      requestId: req.id,
      respondedByUserId: user.id,
      beforeCommit: async () => {
        const clubRow = await getClubById(req.clubId);
        if (!clubRow) return;
        await sendRequesterMail(req.userId, () => {
          const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
          return accessRequestApprovedEmail({
            clubName: clubRow.name,
            requestedRole: req.requestedRole,
            scopeLabel: "Mannschafts-Zugriff",
            homeUrl: `${base}/verein/${clubRow.slug}/mannschaft/${req.requestedTeamId}`
          });
        });
      }
    });
  } catch {
    return { ok: false, error: MAIL_FAILED };
  }

  revalidatePath(
    `/verein/${parsed.data.clubSlug}/mannschaft/${req.requestedTeamId}/einstellungen/mitglieder`
  );
  return { ok: true };
}

export async function rejectRequestAction(
  input: { requestId: string; clubSlug: string; reason?: string }
): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe" };
  const user = await requireUser();

  const req = await getRequestById(parsed.data.requestId);
  if (!req || !req.requestedTeamId) {
    return { ok: false, error: "Anfrage nicht gefunden" };
  }
  if (!(await canManageTeamMembers(user.id, req.requestedTeamId))) {
    return { ok: false, error: NO_PERMISSION };
  }

  try {
    await rejectRequest({
      requestId: req.id,
      respondedByUserId: user.id,
      reason: parsed.data.reason,
      beforeCommit: async () => {
        const clubRow = await getClubById(req.clubId);
        await sendRequesterMail(req.userId, () =>
          accessRequestRejectedEmail({
            clubName: clubRow?.name ?? "deinem Verein",
            reason: parsed.data.reason ?? null
          })
        );
      }
    });
  } catch {
    return { ok: false, error: MAIL_FAILED };
  }

  revalidatePath(
    `/verein/${parsed.data.clubSlug}/mannschaft/${req.requestedTeamId}/einstellungen/mitglieder`
  );
  return { ok: true };
}
