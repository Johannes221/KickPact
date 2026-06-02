import { inngest } from "@/lib/inngest/client";
import { getClubAdminUserIds } from "@/lib/db/queries/notification-recipients";
import { notifyUsers } from "@/lib/notifications/deliver";

/**
 * Push: Neuer Sponsoring-Lead vom öffentlichen Mannschaftsprofil (/m/{slug}).
 * Gefeuert additiv von `createPublicSponsorLead` — die Admin-E-Mail bleibt
 * unberührt. Der Lead stammt von einem NICHT eingeloggten Besucher.
 *
 * Empfänger: Club-Admins.
 */
export const notifySponsorLead = inngest.createFunction(
  { id: "notify-sponsor-lead", name: "Push: Neuer Sponsoring-Lead", concurrency: { limit: 4 } },
  { event: "notification/sponsor-lead" },
  async ({ event, step, logger }) => {
    const { clubId, clubSlug, teamLabel } = event.data as {
      teamId: string;
      leadId: string;
      clubId: string;
      clubSlug: string;
      teamLabel: string;
    };

    const recipients = await step.run("recipients", () => getClubAdminUserIds(clubId));
    if (recipients.length === 0) return { skipped: "no-recipients" };

    await step.run("notify", () =>
      notifyUsers(recipients, {
        type: "sponsor_lead",
        title: "Neue Sponsoring-Anfrage",
        body: `Über euer öffentliches Profil hat jemand Interesse an ${teamLabel}.`,
        link: `/verein/${clubSlug}/sponsoren`,
        data: { clubId }
      })
    );

    logger.info("notify-sponsor-lead done", { clubId, recipients: recipients.length });
    return { recipients: recipients.length };
  }
);
