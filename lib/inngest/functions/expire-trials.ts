/**
 * Trial-Ende Cron (Audit 2026-05-24 Phase 3 / Task 3.3).
 *
 * trial-reminders mailt 7d/3d/1d vor Trial-Ende. ABER: was nach Tag 0 passiert,
 * macht heute NICHTS. Wenn der Verein bis dahin keinen Stripe-Checkout
 * gestartet hat (also stripeSubscriptionId IS NULL), bleibt subscriptions.status
 * für immer auf "trialing" → gateFromSubscription lässt trialing immer durch
 * → Verein behält volle Funktionalität nach Tag 0 unendlich.
 *
 * Dieser Cron schließt die Lücke: täglich alle subscriptions mit
 *   status='trialing' AND trial_ends_at < now AND stripe_subscription_id IS NULL
 * → status='cancelled' + Mail.
 */

import { and, eq, isNull, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { subscriptions, clubs, clubMemberships, users } from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { trialExpiredEmail } from "@/lib/mail/templates/trial-expired";

const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

export const expireTrials = inngest.createFunction(
  { id: "expire-trials", concurrency: { limit: 1 } },
  { cron: "45 2 * * *" }, // täglich 02:45 UTC (nach lifecycle-cleanup)
  async ({ step, logger }) => {
    const now = new Date();

    const expired = await step.run("find-expired-trials", () =>
      db
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
            lt(subscriptions.trialEndsAt, now),
            isNull(subscriptions.stripeSubscriptionId)
          )
        )
    );

    if (expired.length === 0) {
      logger.info("expire-trials: nothing to expire");
      return { expired: 0, mailsSent: 0 };
    }

    let mailsSent = 0;
    for (const sub of expired) {
      await step.run(`cancel-${sub.clubId}`, async () => {
        await db
          .update(subscriptions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(subscriptions.clubId, sub.clubId));
      });

      // Mail an alle Club-Admins
      const admins = await step.run(`load-admins-${sub.clubId}`, () =>
        db
          .select({ email: users.email, name: users.name })
          .from(clubMemberships)
          .innerJoin(users, eq(clubMemberships.userId, users.id))
          .where(
            and(eq(clubMemberships.clubId, sub.clubId), eq(clubMemberships.role, "admin"))
          )
      );
      const adminEmails = admins.filter((a) => a.email).map((a) => a.email);
      if (adminEmails.length === 0) continue;

      await step.run(`mail-${sub.clubId}`, async () => {
        const aboUrl = `${baseUrl}/verein/${sub.clubSlug}/abo`;
        const { subject, html, text } = trialExpiredEmail({
          clubName: sub.clubName,
          aboUrl
        });
        const send = await resend.emails.send({
          from: MAIL_FROM,
          to: adminEmails,
          subject,
          html,
          text,
          headers: {
            "Idempotency-Key": `trial-expired-${sub.clubId}-${now.toISOString().slice(0, 10)}`
          }
        });
        if (send.error) {
          throw new Error(`trial-expired-mail-failed: ${send.error}`);
        }
      });
      mailsSent += adminEmails.length;
    }

    logger.info("expire-trials done", { expired: expired.length, mailsSent });
    return { expired: expired.length, mailsSent };
  }
);
