import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  pledges,
  sponsors,
  teams,
  clubs,
  users,
  sentNotifications
} from "@/lib/db/schema";
import { sponsorLabelSql } from "@/lib/db/queries/sponsor-label";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { seasonEndReminderEmail } from "@/lib/mail/templates/season-end-reminder";
import { getReplyToForClub } from "@/lib/mail/reply-to";

/**
 * Season-End Reminders.
 *
 * Findet alle `active` pledges deren `endsAt` in den nächsten 30 Tagen liegt,
 * und schickt dem Sponsor eine Erinnerungs-Mail mit Renew-Link.
 *
 * Cron: 02:30 UTC jeden Tag — leichter Lauf, idempotent durch eine
 * pledge_id+stage-Markierung (TODO: später dedupe-Tabelle).
 *
 * Manual run: `pledges/season-end-test` Event.
 */
export const seasonEndReminders = inngest.createFunction(
  { id: "season-end-reminders", name: "Season-End Pledge Reminders", concurrency: { limit: 1 } },
  [{ cron: "30 2 * * *" }, { event: "pledges/season-end-test" }],
  async ({ step, logger, event }) => {
    const overrideDays = (event?.data as { daysAhead?: number } | undefined)?.daysAhead;
    const daysAhead = overrideDays ?? 30;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const expiring = await step.run("load-expiring-pledges", async () =>
      db
        .select({
          pledgeId: pledges.id,
          endsAt: pledges.endsAt,
          sponsorId: pledges.sponsorId,
          teamId: pledges.teamId,
          sponsorDisplayName: sponsorLabelSql,
          sponsorEmail: users.email,
          teamName: teams.name,
          clubName: clubs.name,
          clubId: clubs.id
        })
        .from(pledges)
        .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
        .innerJoin(users, eq(sponsors.userId, users.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .where(
          and(
            eq(pledges.status, "active"),
            gte(pledges.endsAt, now),
            lte(pledges.endsAt, windowEnd)
          )
        )
    );

    if (expiring.length === 0) {
      logger.info("no expiring pledges", { daysAhead });
      return { sent: 0, daysAhead };
    }

    let sent = 0;
    const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

    for (const p of expiring) {
      try {
        await step.run(`remind-${p.pledgeId}`, async () => {
          // Audit 2026-05-24 Phase 3 / Task 3.5: Dedupe-Gate über
          // sent_notifications. Bestimme Stage anhand der verbleibenden Tage
          // — wir wollen MAX. 3 Mails pro Pledge: 30d / 14d / 3d.
          const endsAtDate =
            typeof p.endsAt === "string" ? new Date(p.endsAt) : p.endsAt;
          const daysLeft = Math.ceil(
            (endsAtDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          );
          const stage =
            daysLeft <= 3 ? "3d" : daysLeft <= 14 ? "14d" : "30d";
          const dedupeKey = `${p.pledgeId}:${stage}`;

          const gate = await db
            .insert(sentNotifications)
            .values({ kind: "season-end-pledge", key: dedupeKey })
            .onConflictDoNothing()
            .returning({ key: sentNotifications.key });
          if (gate.length === 0) {
            // already sent for this stage today/earlier — silent skip
            return;
          }

          const mail = seasonEndReminderEmail({
            sponsorName: p.sponsorDisplayName,
            teamName: p.teamName,
            clubName: p.clubName,
            endsAt: typeof p.endsAt === "string" ? new Date(p.endsAt) : p.endsAt,
            pledgeId: p.pledgeId,
            renewUrl: `${baseUrl}/sponsor/pledge/new?renew=${p.pledgeId}`
          });
          const replyTo = await getReplyToForClub(p.clubId);
          const result = await resend.emails.send({
            from: MAIL_FROM,
            to: p.sponsorEmail,
            replyTo,
            subject: mail.subject,
            text: mail.text,
            html: mail.html
          });
          if (result.error) {
            logger.error("season-reminder mail failed", {
              pledgeId: p.pledgeId,
              error: result.error
            });
            return;
          }
          sent += 1;
        });
      } catch (err) {
        logger.error("season-reminder loop error", { pledgeId: p.pledgeId, error: String(err) });
      }
    }

    logger.info("season-end-reminders done", { sent, eligible: expiring.length, daysAhead });
    return { sent, eligible: expiring.length, daysAhead };
  }
);
