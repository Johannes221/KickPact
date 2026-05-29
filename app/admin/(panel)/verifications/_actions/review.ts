"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubVerifications,
  teams,
  teamVerifications,
  users
} from "@/lib/db/schema";
import {
  approveVerification,
  rejectVerification,
  approveTeamVerification,
  rejectTeamVerification,
  releaseWithheldInvoicesForClub,
  releaseWithheldInvoicesForTeam,
  getSponsorMailInfoForInvoices
} from "@/lib/db/queries/verifications";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { verificationApprovedEmail } from "@/lib/mail/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/mail/templates/verification-rejected";
import { invoiceReleasedEmail } from "@/lib/mail/templates/invoice-released";

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

  // Release withheld invoices for this club: set status='sent'.
  const { count: releasedCount, invoiceIds } = await releaseWithheldInvoicesForClub(baseInfo.clubId);

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

  // E3: Notify sponsors whose withheld invoices were just released
  if (invoiceIds.length > 0) {
    const sponsorInfos = await getSponsorMailInfoForInvoices(invoiceIds);
    const sponsorDashboardUrl = `${base}/sponsor/rechnungen`;
    await Promise.allSettled(
      sponsorInfos.map((info) => {
        const sponsorMail = invoiceReleasedEmail({
          sponsorName: info.sponsorName,
          entityName: baseInfo.clubName,
          invoiceCount: info.invoiceCount,
          dashboardUrl: sponsorDashboardUrl
        });
        return resend.emails
          .send({
            from: MAIL_FROM,
            to: info.sponsorEmail,
            subject: sponsorMail.subject,
            html: sponsorMail.html,
            text: sponsorMail.text
          })
          .catch((err) =>
            console.error("[invoice-released] mail failed for", info.sponsorEmail, err)
          );
      })
    );
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "verification.approve",
    targetType: "club",
    targetId: baseInfo.clubId,
    summary: `Vereins-Verifizierung freigegeben: ${baseInfo.clubName}`,
    diff: { verificationId: parsed.data.verificationId, releasedInvoices: releasedCount }
  });

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

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "verification.reject",
    targetType: "club",
    targetId: baseInfo.clubId,
    summary: `Vereins-Verifizierung abgelehnt: ${baseInfo.clubName}`,
    diff: { verificationId: parsed.data.verificationId, reason: parsed.data.reason }
  });

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

// ─────────────────────────────────────────────────────────────────────────────
// Team-Verifications (Spec 2026-05-26 §1.7)
// ─────────────────────────────────────────────────────────────────────────────

export async function approveTeamAction(input: { verificationId: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const baseInfo = await loadTeamVerificationInfo(parsed.data.verificationId);
  if (!baseInfo) {
    return { ok: false as const, error: "Verification nicht gefunden" };
  }

  await approveTeamVerification({
    verificationId: parsed.data.verificationId,
    reviewedByUserId: admin.id
  });

  const { count: releasedCount, invoiceIds } = await releaseWithheldInvoicesForTeam(baseInfo.teamId);

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const dashboardUrl = `${base}/verein/${baseInfo.clubSlug}/mannschaft/${baseInfo.teamId}`;
  const mail = verificationApprovedEmail({
    clubName: baseInfo.teamName,
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
    .catch((err) => console.error("[team-verification-approved] mail failed", err));

  // E3: Notify sponsors whose withheld invoices were just released
  if (invoiceIds.length > 0) {
    const sponsorInfos = await getSponsorMailInfoForInvoices(invoiceIds);
    const sponsorDashboardUrl = `${base}/sponsor/rechnungen`;
    await Promise.allSettled(
      sponsorInfos.map((info) => {
        const sponsorMail = invoiceReleasedEmail({
          sponsorName: info.sponsorName,
          entityName: baseInfo.teamName,
          invoiceCount: info.invoiceCount,
          dashboardUrl: sponsorDashboardUrl
        });
        return resend.emails
          .send({
            from: MAIL_FROM,
            to: info.sponsorEmail,
            subject: sponsorMail.subject,
            html: sponsorMail.html,
            text: sponsorMail.text
          })
          .catch((err) =>
            console.error("[invoice-released] mail failed for", info.sponsorEmail, err)
          );
      })
    );
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "verification.approve",
    targetType: "team",
    targetId: baseInfo.teamId,
    summary: `Team-Verifizierung freigegeben: ${baseInfo.teamName}`,
    diff: { verificationId: parsed.data.verificationId, releasedInvoices: releasedCount }
  });

  revalidatePath("/admin/verifications");
  return { ok: true as const, releasedCount };
}

export async function rejectTeamAction(input: {
  verificationId: string;
  reason: string;
}) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Begründung mind. 3 Zeichen" };
  const { user: admin } = await assertPlatformAdmin();

  const baseInfo = await loadTeamVerificationInfo(parsed.data.verificationId);
  if (!baseInfo) {
    return { ok: false as const, error: "Verification nicht gefunden" };
  }

  await rejectTeamVerification({
    verificationId: parsed.data.verificationId,
    reviewedByUserId: admin.id,
    reason: parsed.data.reason
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const reuploadUrl = `${base}/verein/${encodeURIComponent(baseInfo.clubSlug)}/mannschaft/${baseInfo.teamId}/verifikation`;
  const mail = verificationRejectedEmail({
    clubName: baseInfo.teamName,
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
    .catch((err) => console.error("[team-verification-rejected] mail failed", err));

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "verification.reject",
    targetType: "team",
    targetId: baseInfo.teamId,
    summary: `Team-Verifizierung abgelehnt: ${baseInfo.teamName}`,
    diff: { verificationId: parsed.data.verificationId, reason: parsed.data.reason }
  });

  revalidatePath("/admin/verifications");
  return { ok: true as const };
}

async function loadTeamVerificationInfo(verificationId: string): Promise<{
  teamId: string;
  teamName: string;
  clubSlug: string;
  submitterEmail: string;
} | null> {
  const [row] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      clubSlug: clubs.slug,
      submitterEmail: users.email
    })
    .from(teamVerifications)
    .innerJoin(teams, eq(teamVerifications.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(users, eq(teamVerifications.submittedByUserId, users.id))
    .where(eq(teamVerifications.id, verificationId))
    .limit(1);
  return row ?? null;
}

