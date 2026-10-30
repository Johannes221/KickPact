import { inngest } from "@/lib/inngest/client";
import { getMorningBriefingData } from "@/lib/db/queries/morning-briefing";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { morningBriefingEmail } from "@/lib/mail/templates/morning-briefing";

const DEFAULT_RECIPIENT = "johannes.schartl@gmail.com";

/**
 * Empfänger des internen Briefings. Default = Operator; via `MORNING_BRIEFING_TO`
 * (komma-getrennt) überschreibbar, ohne Redeploy.
 */
function briefingRecipients(): string[] {
  return (process.env.MORNING_BRIEFING_TO ?? DEFAULT_RECIPIENT)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tägliches Morgen-Briefing (Plattform-Überblick) an die Operatoren.
 *
 * Cron `0 6 * * *` = 06:00 UTC = 08:00 DE (Sommerzeit; im Winter 07:00 DE —
 * Cron ist fix in UTC, es gibt keinen DST-Cron in Inngest). Idempotent pro Tag
 * über die datums-stabile step.run-ID. Mail-Fehler werden geloggt (kein throw
 * → kein Retry-Doppelversand, gleiche Konvention wie support-sla-reminders).
 */
export const morningBriefing = inngest.createFunction(
  {
    id: "morning-briefing",
    name: "Tägliches Morgen-Briefing (Plattform-Überblick)",
    concurrency: { limit: 1 }
  },
  [{ cron: "0 6 * * *" }, { event: "briefing/morning-test" }],
  async ({ step, logger }) => {
    const today = new Date().toISOString().slice(0, 10);
    const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

    return step.run(`morning-briefing-${today}`, async () => {
      const to = briefingRecipients();
      if (to.length === 0) {
        logger.warn("morning-briefing: no recipients configured");
        return { date: today, sent: false };
      }

      const data = await getMorningBriefingData();
      const mail = morningBriefingEmail({
        data,
        dateLabel: new Date().toLocaleDateString("de-DE", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "Europe/Berlin"
        }),
        dashboardUrl: `${baseUrl}/admin/dashboard`
      });

      const result = await resend.emails.send({
        from: MAIL_FROM,
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      });
      if (result.error) {
        logger.error("morning-briefing mail failed", { error: result.error });
        return { date: today, sent: false };
      }

      logger.info("morning-briefing sent", { recipients: to.length });
      return { date: today, sent: true, recipients: to.length };
    });
  }
);
