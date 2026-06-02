import { inngest } from "@/lib/inngest/client";
import { listOverdueTickets, ticketReference } from "@/lib/db/queries/support";
import { listPlatformAdminEmails } from "@/lib/auth/admin";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { supportOverdueDigestEmail } from "@/lib/mail/templates/support-overdue-digest";

const THRESHOLD_HOURS = 24;

/**
 * Täglicher SLA-Reminder: sammelt überfällige Support-Tickets (offen/in
 * Bearbeitung, der Kunde wartet, älter als THRESHOLD_HOURS) und schickt einen
 * Digest an alle Operatoren. Wird nur versendet, wenn es überfällige Tickets
 * gibt. Idempotent pro Tag via step.run mit datums-stabiler ID.
 */
export const supportSlaReminders = inngest.createFunction(
  { id: "support-sla-reminders", name: "Support SLA-Reminder (überfällige Tickets)", concurrency: { limit: 1 } },
  [{ cron: "0 9 * * *" }, { event: "support/sla-test" }],
  async ({ step, logger }) => {
    const today = new Date().toISOString().slice(0, 10);
    const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

    return step.run(`support-sla-${today}`, async () => {
      const overdue = await listOverdueTickets(THRESHOLD_HOURS);
      if (overdue.length === 0) {
        logger.info("support-sla: nothing overdue");
        return { date: today, overdue: 0, sent: false };
      }

      const adminEmails = await listPlatformAdminEmails();
      if (adminEmails.length === 0) {
        logger.warn("support-sla: no operator emails");
        return { date: today, overdue: overdue.length, sent: false };
      }

      const now = Date.now();
      const mail = supportOverdueDigestEmail({
        thresholdHours: THRESHOLD_HOURS,
        inboxUrl: `${baseUrl}/admin/support?view=overdue`,
        items: overdue.map((t) => ({
          reference: ticketReference(t.id),
          subject: t.subject,
          priority: t.priority,
          ageHours: Math.floor((now - new Date(t.createdAt).getTime()) / 3_600_000),
          url: `${baseUrl}/admin/support/${t.id}`
        }))
      });

      const result = await resend.emails.send({
        from: MAIL_FROM,
        to: adminEmails,
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      });
      if (result.error) {
        logger.error("support-sla mail failed", { error: result.error });
        return { date: today, overdue: overdue.length, sent: false };
      }

      logger.info("support-sla digest sent", { overdue: overdue.length, recipients: adminEmails.length });
      return { date: today, overdue: overdue.length, sent: true };
    });
  }
);
