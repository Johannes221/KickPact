"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserOrThrow, SESSION_EXPIRED_MESSAGE } from "@/lib/auth/session";
import {
  createSupportTicket,
  countRecentTicketsByEmail,
  addCustomerReply,
  getTicketForUser,
  ticketReference
} from "@/lib/db/queries/support";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { notifyOperators } from "@/lib/mail/notify-operators";
import { supportNewTicketEmail } from "@/lib/mail/templates/support-new-ticket";
import { supportTicketReceivedEmail } from "@/lib/mail/templates/support-ticket-received";
import { supportCustomerRepliedEmail } from "@/lib/mail/templates/support-customer-replied";

const CONTEXT_TYPES = ["none", "match", "invoice", "pledge", "team", "page"] as const;

const reportSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  category: z.enum(["frage", "bug", "abrechnung", "spieldaten", "sonstiges"]),
  subject: z.string().min(3).max(150),
  message: z.string().min(10).max(5000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  contextType: z.enum(CONTEXT_TYPES).optional(),
  contextId: z.string().max(64).optional().nullable(),
  contextUrl: z.string().max(2000).optional().nullable(),
  // Informativer Snapshot (z.B. Spiel-Label). Nicht autorisierungsrelevant.
  contextMeta: z.record(z.string(), z.unknown()).optional().nullable(),
  clubId: z.string().max(64).optional().nullable(),
  teamId: z.string().max(64).optional().nullable()
});

const MAX_TICKETS_PER_HOUR = 8;

function baseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/** Kurzer Kontext-String für die Operator-Benachrichtigung. */
function contextSummary(
  contextType: string | undefined,
  meta: Record<string, unknown> | null | undefined,
  url: string | null | undefined
): string | null {
  if (meta && typeof meta.label === "string") return meta.label;
  if (contextType && contextType !== "none") return `${contextType}${url ? ` · ${url}` : ""}`;
  if (url) return url;
  return null;
}

export type ReportInput = z.infer<typeof reportSchema>;

export async function submitProblemReport(input: ReportInput) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte fülle alle Felder korrekt aus." };
  }

  let user;
  try {
    user = await requireUserOrThrow();
  } catch (err) {
    if (err instanceof Error && err.message === SESSION_EXPIRED_MESSAGE) {
      return { ok: false as const, error: SESSION_EXPIRED_MESSAGE };
    }
    throw err;
  }

  const recent = await countRecentTicketsByEmail(parsed.data.email, 60);
  if (recent >= MAX_TICKETS_PER_HOUR) {
    return {
      ok: false as const,
      error: "Zu viele Anfragen. Bitte versuch es später erneut."
    };
  }

  const d = parsed.data;
  let ticketId: string;
  try {
    ticketId = await createSupportTicket({
      name: d.name,
      email: d.email,
      category: d.category,
      subject: d.subject,
      message: d.message,
      priority: d.priority ?? "normal",
      userId: user.id,
      clubId: d.clubId ?? null,
      teamId: d.teamId ?? null,
      contextType: d.contextType ?? "none",
      contextId: d.contextId ?? null,
      contextUrl: d.contextUrl ?? null,
      contextMeta: d.contextMeta ?? null
    });
  } catch (err) {
    console.error("[support] submitProblemReport failed", err);
    return { ok: false as const, error: "Senden fehlgeschlagen. Bitte später erneut versuchen." };
  }

  const reference = ticketReference(ticketId);
  const ctx = contextSummary(d.contextType, d.contextMeta ?? null, d.contextUrl ?? null);

  // Operator-Benachrichtigung (best-effort).
  try {
    const mail = supportNewTicketEmail({
      category: d.category,
      subject: d.subject,
      fromName: d.name,
      fromEmail: d.email,
      adminUrl: `${baseUrl()}/admin/support/${ticketId}`,
      priority: d.priority ?? "normal",
      context: ctx
    });
    await notifyOperators(mail);
  } catch (err) {
    console.error("[support] operator notification failed", err);
  }

  // Eingangsbestätigung an den Kunden (best-effort).
  try {
    const mail = supportTicketReceivedEmail({
      recipientName: d.name,
      subject: d.subject,
      reference,
      ticketUrl: `${baseUrl()}/konto/support/${ticketId}`
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: d.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  } catch (err) {
    console.error("[support] customer confirmation failed", err);
  }

  revalidatePath("/konto/support");
  return { ok: true as const, ticketId, reference };
}

const replySchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(1, "Antwort darf nicht leer sein").max(5000)
});

export async function addCustomerReplyAction(input: { ticketId: string; body: string }) {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }

  let user;
  try {
    user = await requireUserOrThrow();
  } catch (err) {
    if (err instanceof Error && err.message === SESSION_EXPIRED_MESSAGE) {
      return { ok: false as const, error: SESSION_EXPIRED_MESSAGE };
    }
    throw err;
  }

  // Owner-Check + Daten für die Benachrichtigung.
  const ticket = await getTicketForUser(parsed.data.ticketId, user.id);
  if (!ticket) return { ok: false as const, error: "Ticket nicht gefunden." };

  const res = await addCustomerReply({
    ticketId: parsed.data.ticketId,
    userId: user.id,
    body: parsed.data.body
  });
  if (!res.ok) return { ok: false as const, error: "Antwort konnte nicht gespeichert werden." };

  // Operatoren benachrichtigen (best-effort).
  try {
    const mail = supportCustomerRepliedEmail({
      reference: ticketReference(ticket.id),
      subject: ticket.subject,
      fromName: ticket.name,
      excerpt: parsed.data.body,
      adminUrl: `${baseUrl()}/admin/support/${ticket.id}`
    });
    await notifyOperators(mail);
  } catch (err) {
    console.error("[support] customer-reply notification failed", err);
  }

  revalidatePath(`/konto/support/${parsed.data.ticketId}`);
  revalidatePath("/konto/support");
  return { ok: true as const };
}
