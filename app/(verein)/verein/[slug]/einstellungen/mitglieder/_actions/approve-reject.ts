"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getUserEmailById } from "@/lib/db/queries/account";
import { getClubById } from "@/lib/db/queries/club-admin";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

const approveSchema = z.object({ requestId: z.string().min(1), clubSlug: z.string().min(1) });
const rejectSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1),
  reason: z.string().max(280).optional()
});

export async function approveRequestAction(input: { requestId: string; clubSlug: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  await approveRequest({ requestId: req.id, respondedByUserId: admin.id });

  // Notify requester
  const requesterEmail = await getUserEmailById(req.userId);
  if (requesterEmail) {
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const homeUrl = req.requestedTeamId
      ? `${base}/verein/${club.slug}/mannschaft/${req.requestedTeamId}`
      : `${base}/verein/${club.slug}`;
    const scopeLabel = req.requestedTeamId ? "Mannschafts-Zugriff" : "Vereins-Zugriff";
    const mail = accessRequestApprovedEmail({
      clubName: club.name,
      requestedRole: req.requestedRole,
      scopeLabel,
      homeUrl
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: requesterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}

export async function rejectRequestAction(input: { requestId: string; clubSlug: string; reason?: string }) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  await rejectRequest({
    requestId: req.id,
    respondedByUserId: admin.id,
    reason: parsed.data.reason
  });

  // Notify requester
  const requesterEmail = await getUserEmailById(req.userId);
  if (requesterEmail) {
    const clubRow = await getClubById(req.clubId);
    const mail = accessRequestRejectedEmail({
      clubName: clubRow?.name ?? club.name,
      reason: parsed.data.reason ?? null
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: requesterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}
