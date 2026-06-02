import { magicLinkEmail } from "@/lib/mail/templates/magic-link";
import { adminPasswordResetEmail } from "@/lib/mail/templates/admin-password-reset";
import { supportReplyEmail } from "@/lib/mail/templates/support-reply";
import { supportNewTicketEmail } from "@/lib/mail/templates/support-new-ticket";
import { supportTicketReceivedEmail } from "@/lib/mail/templates/support-ticket-received";
import { supportCustomerRepliedEmail } from "@/lib/mail/templates/support-customer-replied";
import { supportAssignedEmail } from "@/lib/mail/templates/support-assigned";
import { supportOverdueDigestEmail } from "@/lib/mail/templates/support-overdue-digest";
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
      mail: supportNewTicketEmail({ category: "spieldaten", subject: "Ergebnis stimmt nicht", fromName: "Max Muster", fromEmail: "max@beispiel.de", adminUrl: SAMPLE_URL, priority: "high", context: "Spiel: SV A – FC B (2:1)" })
    },
    {
      key: "support-ticket-received",
      label: "Eingangsbestätigung (an Kunde)",
      mail: supportTicketReceivedEmail({ recipientName: "Max Muster", subject: "Ergebnis stimmt nicht", reference: "KP-7F8A2C", ticketUrl: SAMPLE_URL })
    },
    {
      key: "support-customer-replied",
      label: "Kundenantwort (an Operator)",
      mail: supportCustomerRepliedEmail({ reference: "KP-7F8A2C", subject: "Ergebnis stimmt nicht", fromName: "Max Muster", excerpt: "Danke, aber das Tor in Minute 87 fehlt immer noch …", adminUrl: SAMPLE_URL })
    },
    {
      key: "support-assigned",
      label: "Ticket zugewiesen (an Operator)",
      mail: supportAssignedEmail({ reference: "KP-7F8A2C", subject: "Ergebnis stimmt nicht", priority: "Hoch", assignedBy: "operator@kickpact.de", adminUrl: SAMPLE_URL })
    },
    {
      key: "support-overdue-digest",
      label: "Überfällige Tickets (Digest)",
      mail: supportOverdueDigestEmail({ thresholdHours: 24, inboxUrl: SAMPLE_URL, items: [
        { reference: "KP-7F8A2C", subject: "Ergebnis stimmt nicht", priority: "urgent", ageHours: 36, url: SAMPLE_URL },
        { reference: "KP-1B2C3D", subject: "Rechnung unklar", priority: "normal", ageHours: 28, url: SAMPLE_URL }
      ] })
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
