import { listPlatformAdminEmails } from "@/lib/auth/admin";
import { resend, MAIL_FROM } from "@/lib/mail/client";

/**
 * Verschickt eine Operator-Benachrichtigung (neues Ticket, Kunden-Antwort …) an
 * alle als `is_platform_admin` geflaggten Operatoren PLUS immer das
 * Support-Postfach (`SUPPORT_INBOX_EMAIL`, Default support@kickpact.com).
 *
 * Warum das Support-Postfach IMMER dabei ist: ist (noch) kein Operator geflaggt,
 * wäre die Empfängerliste leer und die Meldung ginge still verloren — das Ticket
 * wird angelegt, aber niemand erfährt davon. Über die Cloudflare-Email-Routing-
 * Weiterleitung landet support@kickpact.com im echten Operator-Postfach.
 *
 * `resend.emails.send` wirft bei API-Fehlern NICHT, sondern liefert `{ error }`.
 * Ohne diese Prüfung scheitert der Versand komplett unsichtbar (kein Log).
 *
 * Best-effort: Aufruf immer in try/catch der Call-Site — ein Mail-Fehler darf den
 * eigentlichen Vorgang (Ticket ist bereits gespeichert) nicht scheitern lassen.
 */
export async function notifyOperators(mail: {
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const adminEmails = await listPlatformAdminEmails();
  const supportInbox = process.env.SUPPORT_INBOX_EMAIL ?? "support@kickpact.com";
  const recipients = Array.from(new Set([...adminEmails, supportInbox]));

  if (adminEmails.length === 0) {
    console.warn(
      `[support] kein Platform-Admin geflaggt — Benachrichtigung an ${supportInbox}`
    );
  }

  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: recipients,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  });
  if (error) {
    console.error("[support] operator notification resend error", error);
  }
}
