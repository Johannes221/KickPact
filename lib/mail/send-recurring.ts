import { resend, MAIL_FROM } from "@/lib/mail/client";
import { isEmailRecurringEnabled } from "@/lib/db/queries/notifications";
import { signEmailUnsubscribeToken } from "@/lib/auth/email-unsubscribe-token";

/**
 * Zentrale Zustellung für WIEDERKEHRENDE (nicht-zwingende) Mails —
 * Approval-Reminder, Saison-Renewal-Prompt & Co.
 *
 * Gegen transaktionale Mails (Rechnung, Verifikation, Magic-Link) abgegrenzt:
 * diese laufen weiter direkt über `resend.emails.send` und werden IMMER
 * zugestellt. Nur der wiederkehrende Kanal ist opt-out-fähig.
 *
 * Pro Empfänger:
 *  1. Präferenz respektieren — opt-out (`email_recurring=false`) → NICHT senden.
 *  2. List-Unsubscribe-Header (RFC 8058 One-Click + https-URL) setzen —
 *     erfüllt die Gmail/Yahoo-Bulk-Anforderungen und verbessert Zustellbarkeit.
 *  3. Sichtbaren „Abmelden"-Link in HTML + Text-Body einfügen.
 *
 * Der Empfänger ist EIN User (per-User-Token). Deshalb bewusst nur für
 * 1:1-Mails gedacht, nicht für Sammel-`to`-Listen.
 */

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "https://kickpact.schartl.dev"
  ).replace(/\/$/, "");
}

/** Unsubscribe-URL für einen User (TTL großzügig, damit alte Mails wirken). */
export function buildUnsubscribeUrl(userId: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const token = signEmailUnsubscribeToken({
    userId,
    iat,
    exp: iat + 400 * 24 * 60 * 60 // ~400 Tage
  });
  return `${baseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function withHtmlFooter(html: string, url: string): string {
  const footer = `<div style="margin-top:24px;text-align:center;font-size:11px;color:#a3a3a3;line-height:1.5;">Diese Erinnerungen möchtest du nicht mehr per E-Mail erhalten?<br><a href="${url}" style="color:#a3a3a3;text-decoration:underline;">Abmelden</a></div>`;
  return html.includes("</body>")
    ? html.replace("</body>", `${footer}</body>`)
    : `${html}${footer}`;
}

function withTextFooter(text: string, url: string): string {
  return `${text}\n\n—\nKeine solchen E-Mail-Erinnerungen mehr? Hier abmelden:\n${url}`;
}

export interface SendRecurringInput {
  /** Empfänger-User — steuert Opt-out-Check und Unsubscribe-Token. */
  userId: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export type SendRecurringResult =
  | { skipped: true }
  | { skipped: false; error: unknown };

export async function sendRecurringEmail(
  input: SendRecurringInput
): Promise<SendRecurringResult> {
  if (!(await isEmailRecurringEnabled(input.userId))) {
    return { skipped: true };
  }

  const url = buildUnsubscribeUrl(input.userId);
  const result = await resend.emails.send({
    from: MAIL_FROM,
    to: input.to,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    subject: input.subject,
    html: withHtmlFooter(input.html, url),
    text: withTextFooter(input.text, url),
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });

  return { skipped: false, error: result.error ?? null };
}
