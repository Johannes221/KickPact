import { inngest } from "@/lib/inngest/client";
import { getClubAdminUserIds } from "@/lib/db/queries/notification-recipients";
import { notifyUsers } from "@/lib/notifications/deliver";

/**
 * Push: Neue Sponsoring-Anfrage von einem eingeloggten Sponsor. Gefeuert additiv
 * von `createSponsorInquiry` — die bestehende Admin-E-Mail bleibt unberührt.
 *
 * Empfänger: Club-Admins.
 */
export const notifySponsorInquiry = inngest.createFunction(
  { id: "notify-sponsor-inquiry", name: "Push: Neue Sponsoring-Anfrage", concurrency: { limit: 4 } },
  { event: "notification/sponsor-inquiry" },
  async ({ event, step, logger }) => {
    const { clubId, clubSlug, teamName } = event.data as {
      teamId: string;
      clubId: string;
      clubSlug: string;
      teamName: string;
    };

    const recipients = await step.run("recipients", () => getClubAdminUserIds(clubId));
    if (recipients.length === 0) return { skipped: "no-recipients" };

    await step.run("notify", () =>
      notifyUsers(recipients, {
        type: "sponsor_inquiry",
        title: "Neue Sponsoring-Anfrage",
        body: `Ein Sponsor möchte ${teamName} unterstützen.`,
        link: `/verein/${clubSlug}/sponsoren`,
        data: { clubId }
      })
    );

    logger.info("notify-sponsor-inquiry done", { clubId, recipients: recipients.length });
    return { recipients: recipients.length };
  }
);
