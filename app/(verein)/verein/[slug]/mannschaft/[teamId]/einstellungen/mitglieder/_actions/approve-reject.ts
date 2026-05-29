"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { canManageTeamMembers } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubs, users } from "@/lib/db/schema";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

type ActionResult = { ok: true } | { ok: false; error: string };

const NO_PERMISSION = "Keine Berechtigung für diese Mannschaft.";

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

  await approveRequest({ requestId: req.id, respondedByUserId: user.id });

  const [requester] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);
  const [clubRow] = await db
    .select({ name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.id, req.clubId))
    .limit(1);
  if (requester && clubRow) {
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const mail = accessRequestApprovedEmail({
      clubName: clubRow.name,
      requestedRole: req.requestedRole,
      scopeLabel: "Mannschafts-Zugriff",
      homeUrl: `${base}/verein/${clubRow.slug}/mannschaft/${req.requestedTeamId}`
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: requester.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
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

  await rejectRequest({
    requestId: req.id,
    respondedByUserId: user.id,
    reason: parsed.data.reason
  });

  const [requester] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);
  const [clubRow] = await db
    .select({ name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, req.clubId))
    .limit(1);
  if (requester) {
    const mail = accessRequestRejectedEmail({
      clubName: clubRow?.name ?? "deinem Verein",
      reason: parsed.data.reason ?? null
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: requester.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  }

  revalidatePath(
    `/verein/${parsed.data.clubSlug}/mannschaft/${req.requestedTeamId}/einstellungen/mitglieder`
  );
  return { ok: true };
}
