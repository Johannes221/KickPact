"use server";

import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { listPlatformAdminEmails } from "@/lib/auth/admin";
import { createSupportTicket, countRecentTicketsByEmail } from "@/lib/db/queries/support";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { supportNewTicketEmail } from "@/lib/mail/templates/support-new-ticket";
import { rateLimit, getClientIp } from "@/lib/utils/rate-limit";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  category: z.enum(["frage", "bug", "abrechnung", "sonstiges"]),
  subject: z.string().min(3).max(150),
  message: z.string().min(10).max(5000),
  // Honeypot: echtes Feld ist für Menschen unsichtbar; Bots füllen es aus.
  website: z.string().optional()
});

const MAX_TICKETS_PER_HOUR = 5;

export async function submitSupportTicket(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte fülle alle Felder korrekt aus." };
  }

  // Bot-Falle: Honeypot ausgefüllt → still als "ok" abtun, nichts speichern.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return { ok: true as const };
  }

  // SECURITY (M5): IP-basiertes Rate-Limit. Der E-Mail-Zähler unten ist
  // umgehbar (Angreifer rotiert die E-Mail pro Request) — die IP-Schranke
  // greift unabhängig vom Eingabefeld. 10 Anfragen / 10 Min / IP.
  const ip = await getClientIp();
  if (!(await rateLimit(`support:${ip}`, { limit: 10, windowMs: 10 * 60_000 }))) {
    return {
      ok: false as const,
      error: "Zu viele Anfragen. Bitte versuch es später erneut oder schreib uns direkt per Mail."
    };
  }

  // Rate-Limit pro E-Mail (Anti-Spam).
  const recent = await countRecentTicketsByEmail(parsed.data.email, 60);
  if (recent >= MAX_TICKETS_PER_HOUR) {
    return {
      ok: false as const,
      error: "Zu viele Anfragen. Bitte versuch es später erneut oder schreib uns direkt per Mail."
    };
  }

  const session = await getServerSession();

  let ticketId: string;
  try {
    ticketId = await createSupportTicket({
      name: parsed.data.name,
      email: parsed.data.email,
      category: parsed.data.category,
      subject: parsed.data.subject,
      message: parsed.data.message,
      userId: session?.user?.id ?? null
    });
  } catch (err) {
    console.error("[support] createSupportTicket failed", err);
    return { ok: false as const, error: "Senden fehlgeschlagen. Bitte später erneut versuchen." };
  }

  // Operator-Benachrichtigung (best-effort, blockiert die Antwort nicht).
  try {
    const adminEmails = await listPlatformAdminEmails();
    if (adminEmails.length > 0) {
      const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const mail = supportNewTicketEmail({
        category: parsed.data.category,
        subject: parsed.data.subject,
        fromName: parsed.data.name,
        fromEmail: parsed.data.email,
        adminUrl: `${base}/admin/support/${ticketId}`
      });
      await resend.emails.send({
        from: MAIL_FROM,
        to: adminEmails,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      });
    }
  } catch (err) {
    console.error("[support] operator notification failed", err);
  }

  return { ok: true as const };
}
