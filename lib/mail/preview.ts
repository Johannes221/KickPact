import { magicLinkEmail } from "@/lib/mail/templates/magic-link";
import { adminPasswordResetEmail } from "@/lib/mail/templates/admin-password-reset";
import { supportReplyEmail } from "@/lib/mail/templates/support-reply";
import { supportNewTicketEmail } from "@/lib/mail/templates/support-new-ticket";
import { invoiceReminderEmail } from "@/lib/mail/templates/invoice-reminder";
import { verificationApprovedEmail } from "@/lib/mail/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/mail/templates/verification-rejected";

export interface RenderedTemplate {
  key: string;
  label: string;
  subject: string;
  html: string;
  text: string;
}

const SAMPLE_URL = "https://kickpact.de/example-link";

/**
 * Rendert eine kuratierte Auswahl der Mail-Templates mit Beispieldaten — für
 * die Operator-Vorschau und den Test-Versand unter /admin/mail. Beispieldaten
 * sind konstant (kein User-Input) → das HTML ist sicher in einem iframe-srcDoc
 * darstellbar.
 */
export function renderTemplatePreviews(): RenderedTemplate[] {
  const items: Array<{ key: string; label: string; mail: { subject: string; html: string; text: string } }> = [
    { key: "magic-link", label: "Magic-Link (Login)", mail: magicLinkEmail({ url: SAMPLE_URL, email: "max@beispiel.de" }) },
    { key: "admin-password-reset", label: "Operator Passwort-Reset", mail: adminPasswordResetEmail({ url: SAMPLE_URL, email: "operator@kickpact.de" }) },
    {
      key: "support-reply",
      label: "Support-Antwort",
      mail: supportReplyEmail({ recipientName: "Max Muster", subject: "Frage zu Pacts", body: "Hi Max,\n\ndanke für deine Nachricht — so funktioniert das …" })
    },
    {
      key: "support-new-ticket",
      label: "Neues Ticket (an Operator)",
      mail: supportNewTicketEmail({ category: "frage", subject: "Wie funktioniert das?", fromName: "Max Muster", fromEmail: "max@beispiel.de", adminUrl: SAMPLE_URL })
    },
    {
      key: "invoice-reminder",
      label: "Rechnungs-Erinnerung",
      mail: invoiceReminderEmail({ sponsorName: "Familie Muster", clubName: "FC Beispiel", period: "2026-04", totalEur: "42,00 €", dashboardUrl: SAMPLE_URL })
    },
    {
      key: "verification-approved",
      label: "Verifizierung freigegeben",
      mail: verificationApprovedEmail({ clubName: "FC Beispiel", dashboardUrl: SAMPLE_URL, withheldInvoiceCount: 3 })
    },
    {
      key: "verification-rejected",
      label: "Verifizierung abgelehnt",
      mail: verificationRejectedEmail({ clubName: "FC Beispiel", reason: "Dokument unleserlich", reuploadUrl: SAMPLE_URL })
    }
  ];

  return items.map((i) => ({
    key: i.key,
    label: i.label,
    subject: i.mail.subject,
    html: i.mail.html,
    text: i.mail.text
  }));
}
