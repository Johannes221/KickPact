import { inngest } from "@/lib/inngest/client";
import {
  getClubAdminUserIds,
  getTeamAdminUserIds
} from "@/lib/db/queries/notification-recipients";
import { notifyUsers } from "@/lib/notifications/deliver";

/**
 * Push: Neue Zugriffs-Anfrage (Club-Beitritt). Gefeuert additiv von
 * `requestClubAccessAction` — die bestehende Admin-E-Mail bleibt unberührt.
 *
 * Empfänger: Club-Admins (+ Mannschafts-Admins, falls eine Mannschaft adressiert
 * wurde).
 */
export const notifyAccessRequest = inngest.createFunction(
  { id: "notify-access-request", name: "Push: Neue Zugriffs-Anfrage", concurrency: { limit: 4 } },
  { event: "notification/access-request" },
  async ({ event, step, logger }) => {
    const { clubId, clubSlug, clubName, requestedTeamId, requesterEmail, requestedRole } =
      event.data as {
        clubId: string;
        clubSlug: string;
        clubName: string;
        requestedTeamId: string | null;
        requesterEmail: string;
        requestedRole: string;
      };

    const recipients = await step.run("recipients", async () => {
      const ids = await getClubAdminUserIds(clubId);
      if (requestedTeamId) ids.push(...(await getTeamAdminUserIds(requestedTeamId)));
      return ids;
    });
    if (recipients.length === 0) return { skipped: "no-recipients" };

    await step.run("notify", () =>
      notifyUsers(recipients, {
        type: "access_request",
        title: "Neue Zugriffs-Anfrage",
        body: `${requesterEmail} möchte ${requestedRole}-Zugriff auf ${clubName}.`,
        link: `/verein/${clubSlug}/einstellungen/mitglieder`,
        data: { clubId, requestedTeamId: requestedTeamId ?? null }
      })
    );

    logger.info("notify-access-request done", { clubId, recipients: recipients.length });
    return { recipients: recipients.length };
  }
);
