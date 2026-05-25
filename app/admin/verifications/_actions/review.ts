"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { clubs, clubVerifications, users } from "@/lib/db/schema";
import { invoices } from "@/lib/db/schema/charges";
import {
  approveVerification,
  rejectVerification
} from "@/lib/db/queries/verifications";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { verificationApprovedEmail } from "@/lib/mail/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/mail/templates/verification-rejected";

const approveSchema = z.object({ verificationId: z.string().min(1) });
const rejectSchema = z.object({
  verificationId: z.string().min(1),
  reason: z.string().min(3).max(500)
});

export async function approveAction(input: { verificationId: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const baseInfo = await loadVerificationInfo(parsed.data.verificationId);
  if (!baseInfo) {
    return { ok: false as const, error: "Verification nicht gefunden" };
  }

  await approveVerification({
    verificationId: parsed.data.verificationId,
    reviewedByUserId: admin.id
  });

  // Release withheld invoices for this club: set status='sent', send mails.
  const releasedCount = await releaseWithheldInvoices(baseInfo.clubId, baseInfo.clubName);

  // Notify submitter
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const dashboardUrl = `${base}/verein/${baseInfo.clubSlug}`;
  const mail = verificationApprovedEmail({
    clubName: baseInfo.clubName,
    dashboardUrl,
    withheldInvoiceCount: releasedCount
  });
  await resend.emails
    .send({
      from: MAIL_FROM,
      to: baseInfo.submitterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
    .catch((err) => console.error("[verification-approved] mail failed", err));

  revalidatePath("/admin/verifications");
  return { ok: true as const, releasedCount };
}

export async function rejectAction(input: { verificationId: string; reason: string }) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Begründung mind. 3 Zeichen" };
  const { user: admin } = await assertPlatformAdmin();

  const baseInfo = await loadVerificationInfo(parsed.data.verificationId);
  if (!baseInfo) {
    return { ok: false as const, error: "Verification nicht gefunden" };
  }

  await rejectVerification({
    verificationId: parsed.data.verificationId,
    reviewedByUserId: admin.id,
    reason: parsed.data.reason
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  // Verifikation läuft nicht mehr im Onboarding-Wizard, sondern als async
  // Aktion im Vereins-Dashboard via /verein/[slug]/verifikation.
  const reuploadUrl = `${base}/verein/${encodeURIComponent(baseInfo.clubSlug)}/verifikation`;
  const mail = verificationRejectedEmail({
    clubName: baseInfo.clubName,
    reason: parsed.data.reason,
    reuploadUrl
  });
  await resend.emails
    .send({
      from: MAIL_FROM,
      to: baseInfo.submitterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
    .catch((err) => console.error("[verification-rejected] mail failed", err));

  revalidatePath("/admin/verifications");
  return { ok: true as const };
}

/**
 * Lookup helper: joins club_verifications → users → clubs to get all the
 * info needed for mail + dashboard link.
 */
async function loadVerificationInfo(verificationId: string): Promise<{
  clubId: string;
  clubSlug: string;
  clubName: string;
  submitterEmail: string;
} | null> {
  const [row] = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      submitterEmail: users.email
    })
    .from(clubVerifications)
    .innerJoin(clubs, eq(clubVerifications.clubId, clubs.id))
    .innerJoin(users, eq(clubVerifications.submittedByUserId, users.id))
    .where(eq(clubVerifications.id, verificationId))
    .limit(1);
  return row ?? null;
}

/**
 * After approve, release any withheld invoices for this club: flip
 * status='sent' (the PDF + invoice row already exist from when generate-invoices
 * ran). Returns the count of released invoices for the mail body.
 *
 * NOTE: Phase E2 does NOT re-send the mail to the sponsor — the click-through
 * URL on the sponsor side will simply show a no-longer-withheld invoice next
 * time they look. Auto-mailing released invoices is a Phase E3 nicety.
 */
async function releaseWithheldInvoices(
  clubId: string,
  clubName: string
): Promise<number> {
  void clubName; // Reserved for future mail body
  const result = await db
    .update(invoices)
    .set({ status: "sent" })
    .where(and(eq(invoices.clubId, clubId), eq(invoices.status, "withheld")))
    .returning({ id: invoices.id });
  return result.length;
}
