"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { markInvoicePaid, getInvoiceMailInfo } from "@/lib/db/queries/invoice-admin";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { invoiceReminderEmail } from "@/lib/mail/templates/invoice-reminder";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

const paidSchema = z.object({ invoiceId: z.string().min(1), paid: z.boolean() });

export async function markInvoicePaidAction(input: { invoiceId: string; paid: boolean }) {
  const parsed = paidSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const info = await getInvoiceMailInfo(parsed.data.invoiceId);
  if (!info) return { ok: false as const, error: "Rechnung nicht gefunden" };

  await markInvoicePaid({
    invoiceId: parsed.data.invoiceId,
    paid: parsed.data.paid,
    operatorUserId: admin.id
  });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: parsed.data.paid ? "invoice.mark_paid" : "invoice.mark_unpaid",
    targetType: "invoice",
    targetId: parsed.data.invoiceId,
    summary: `Rechnung ${info.period} ${parsed.data.paid ? "als bezahlt" : "als offen"} markiert (${info.sponsorName})`
  });

  revalidatePath("/admin/rechnungen");
  return { ok: true as const };
}

export async function sendInvoiceReminderAction(input: { invoiceId: string }) {
  const parsed = z.object({ invoiceId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const info = await getInvoiceMailInfo(parsed.data.invoiceId);
  if (!info) return { ok: false as const, error: "Rechnung nicht gefunden" };

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const mail = invoiceReminderEmail({
    sponsorName: info.sponsorName,
    clubName: info.clubName,
    period: info.period,
    totalEur: eur(info.totalCents),
    dashboardUrl: `${base}/sponsor/rechnungen`
  });
  const result = await resend.emails.send({
    from: MAIL_FROM,
    to: info.sponsorEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  });
  if (result.error) {
    console.error("[invoice-reminder] Resend send failed", result.error);
    return { ok: false as const, error: "Erinnerung konnte nicht gesendet werden." };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "invoice.reminder",
    targetType: "invoice",
    targetId: parsed.data.invoiceId,
    summary: `Rechnungs-Erinnerung gesendet an ${info.sponsorEmail} (${info.period})`
  });

  revalidatePath("/admin/rechnungen");
  return { ok: true as const };
}
