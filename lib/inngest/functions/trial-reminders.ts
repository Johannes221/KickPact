import { and, eq, gte, lte } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { subscriptions, clubs, clubMemberships, users } from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { trialReminderEmail } from "@/lib/mail/templates/trial-reminder";

/**
 * Daily Cron — sucht Subscriptions mit Status=trialing deren trialEndsAt
 * heute in 7d / 3d / 1d ist und mailt alle Club-Admins.
 *
 * Bug-Schutz: pro (club_id, daysLeft) wird nur 1× am Tag gesendet.
 * Inngest's step.run mit deterministischer ID (`${clubId}-${daysLeft}`) + Date
 * sorgt für Idempotenz.
 */
export const trialReminders = inngest.createFunction(
  { id: "trial-reminders", name: "Trial-Ablauf Reminders 7d/3d/1d" },
  [{ cron: "0 10 * * *" }, { event: "subscriptions/trial-test" }],
  async ({ step, logger }) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

    const reminderDays = [7, 3, 1];
    let mailsSent = 0;
    const reports: { clubId: string; days: number; emails: number }[] = [];

    for (const daysLeft of reminderDays) {
      // Tagesfenster für endsAt = now + daysLeft (24h-Slot)
      const targetStart = new Date(now);
      targetStart.setUTCDate(targetStart.getUTCDate() + daysLeft);
      targetStart.setUTCHours(0, 0, 0, 0);
      const targetEnd = new Date(targetStart);
      targetEnd.setUTCHours(23, 59, 59, 999);

      const subs = await db
        .select({
          clubId: subscriptions.clubId,
          trialEndsAt: subscriptions.trialEndsAt,
          clubName: clubs.name,
          clubSlug: clubs.slug
        })
        .from(subscriptions)
        .innerJoin(clubs, eq(subscriptions.clubId, clubs.id))
        .where(
          and(
            eq(subscriptions.status, "trialing"),
            gte(subscriptions.trialEndsAt, targetStart),
            lte(subscriptions.trialEndsAt, targetEnd)
          )
        );

      for (const sub of subs) {
        const stepId = `trial-remind-${sub.clubId}-${daysLeft}-${today}`;
        try {
          await step.run(stepId, async () => {
            const admins = await db
              .select({ email: users.email, name: users.name })
              .from(clubMemberships)
              .innerJoin(users, eq(clubMemberships.userId, users.id))
              .where(
                and(eq(clubMemberships.clubId, sub.clubId), eq(clubMemberships.role, "admin"))
              );

            if (admins.length === 0) {
              logger.warn("trial-reminder: no admin emails", { clubId: sub.clubId });
              return;
            }

            const mail = trialReminderEmail({
              adminName: admins[0]?.name ?? null,
              clubName: sub.clubName,
              daysLeft,
              endsAt: sub.trialEndsAt ?? new Date(),
              manageUrl: `${baseUrl}/verein/${sub.clubSlug}/abo`
            });

            const result = await resend.emails.send({
              from: MAIL_FROM,
              to: admins.map((a) => a.email),
              subject: mail.subject,
              text: mail.text,
              html: mail.html
            });

            if (result.error) {
              logger.error("trial-reminder mail failed", {
                clubId: sub.clubId,
                error: result.error
              });
              return;
            }
            mailsSent += admins.length;
            reports.push({ clubId: sub.clubId, days: daysLeft, emails: admins.length });
          });
        } catch (err) {
          logger.error("trial-reminder step error", { clubId: sub.clubId, error: String(err) });
        }
      }
    }

    logger.info("trial-reminders done", { mailsSent, reports });
    return { date: today, mailsSent, reports };
  }
);
