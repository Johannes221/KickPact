"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin, listPlatformAdmins } from "@/lib/auth/admin";
import {
  getSupportTicket,
  addSupportReply,
  setSupportTicketStatus,
  assignTicket,
  setTicketPriority,
  ticketReference
} from "@/lib/db/queries/support";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { supportReplyEmail } from "@/lib/mail/templates/support-reply";
import { supportAssignedEmail } from "@/lib/mail/templates/support-assigned";

function baseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

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
    body: parsed.data.body,
    reference: ticketReference(ticket.id),
    // Nur eingeloggte Kunden haben ein In-App-Ticket-Center.
    ticketUrl: ticket.userId ? `${baseUrl()}/konto/support/${ticket.id}` : undefined
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

const noteSchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(1, "Notiz darf nicht leer sein").max(5000)
});

/** Interne Notiz — wird NICHT gemailt und dem Kunden nicht angezeigt. */
export async function addInternalNoteAction(input: { ticketId: string; body: string }) {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { user: admin } = await assertPlatformAdmin();

  await addSupportReply({
    ticketId: parsed.data.ticketId,
    operatorUserId: admin.id,
    body: parsed.data.body,
    internal: true
  });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "support.note",
    targetType: "support",
    targetId: parsed.data.ticketId,
    summary: "Interne Notiz hinzugefügt"
  });

  revalidatePath(`/admin/support/${parsed.data.ticketId}`);
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

const prioritySchema = z.object({
  ticketId: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"])
});

export async function setPriorityAction(input: {
  ticketId: string;
  priority: "low" | "normal" | "high" | "urgent";
}) {
  const parsed = prioritySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  await setTicketPriority({ ticketId: parsed.data.ticketId, priority: parsed.data.priority });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "support.priority",
    targetType: "support",
    targetId: parsed.data.ticketId,
    summary: `Priorität → ${parsed.data.priority}`
  });

  revalidatePath(`/admin/support/${parsed.data.ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true as const };
}

const assignSchema = z.object({
  ticketId: z.string().min(1),
  // Leerer String → Zuweisung entfernen.
  assignedToUserId: z.string()
});

export async function assignTicketAction(input: { ticketId: string; assignedToUserId: string }) {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const assignee = parsed.data.assignedToUserId || null;
  await assignTicket({ ticketId: parsed.data.ticketId, assignedToUserId: assignee });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "support.assign",
    targetType: "support",
    targetId: parsed.data.ticketId,
    summary: assignee ? `Ticket zugewiesen an ${assignee}` : "Zuweisung entfernt"
  });

  // Benachrichtigung an den neuen Assignee (best-effort, nicht an sich selbst).
  if (assignee && assignee !== admin.id) {
    try {
      const ticket = await getSupportTicket(parsed.data.ticketId);
      const admins = await listPlatformAdmins();
      const target = admins.find((a) => a.id === assignee);
      if (ticket && target) {
        const mail = supportAssignedEmail({
          reference: ticketReference(ticket.id),
          subject: ticket.subject,
          priority: ticket.priority,
          assignedBy: admin.email,
          adminUrl: `${baseUrl()}/admin/support/${ticket.id}`
        });
        await resend.emails.send({
          from: MAIL_FROM,
          to: target.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        });
      }
    } catch (err) {
      console.error("[support] assignment notification failed", err);
    }
  }

  revalidatePath(`/admin/support/${parsed.data.ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true as const };
}
