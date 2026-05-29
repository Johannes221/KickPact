"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import {
  getSupportTicket,
  addSupportReply,
  setSupportTicketStatus
} from "@/lib/db/queries/support";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { supportReplyEmail } from "@/lib/mail/templates/support-reply";

const replySchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(1, "Antwort darf nicht leer sein").max(5000)
});

export async function sendSupportReplyAction(input: { ticketId: string; body: string }) {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { user: admin } = await assertPlatformAdmin();

  const ticket = await getSupportTicket(parsed.data.ticketId);
  if (!ticket) return { ok: false as const, error: "Ticket nicht gefunden" };

  const mail = supportReplyEmail({
    recipientName: ticket.name,
    subject: ticket.subject,
    body: parsed.data.body
  });
  const result = await resend.emails.send({
    from: MAIL_FROM,
    to: ticket.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  });
  if (result.error) {
    console.error("[support-reply] Resend send failed", result.error);
    return { ok: false as const, error: "Antwort-Mail konnte nicht gesendet werden." };
  }

  await addSupportReply({
    ticketId: ticket.id,
    operatorUserId: admin.id,
    body: parsed.data.body,
    mailId: result.data?.id ?? null
  });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "support.reply",
    targetType: "support",
    targetId: ticket.id,
    summary: `Support-Antwort gesendet an ${ticket.email}`,
    diff: { subject: ticket.subject }
  });

  revalidatePath(`/admin/support/${ticket.id}`);
  revalidatePath("/admin/support");
  return { ok: true as const };
}

const statusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(["open", "in_progress", "waiting", "closed"])
});

export async function setSupportStatusAction(input: {
  ticketId: string;
  status: "open" | "in_progress" | "waiting" | "closed";
}) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  await setSupportTicketStatus({ ticketId: parsed.data.ticketId, status: parsed.data.status });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "support.status",
    targetType: "support",
    targetId: parsed.data.ticketId,
    summary: `Support-Status → ${parsed.data.status}`
  });

  revalidatePath(`/admin/support/${parsed.data.ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true as const };
}
