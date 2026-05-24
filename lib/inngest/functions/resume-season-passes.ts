import { inngest } from "@/lib/inngest/client";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { resumeSeasonPassSubscriptions } from "@/lib/billing/season-pass";

/**
 * Sommerpause-Ende: 1. August, 02:00 UTC.
 *
 * Hebt Pause für alle Saison-Pass-Subscriptions auf, setzt `paused_until = null`,
 * `team_licenses.status = 'active'`.
 */
export const resumeSeasonPasses = inngest.createFunction(
  { id: "resume-season-passes", name: "Sommerpause: Saison-Pass reaktivieren (1.8.)" },
  [{ cron: "0 2 1 8 *" }, { event: "subscriptions/resume-season-passes-test" }],
  async ({ logger }) => {
    if (!isStripeConfigured()) {
      logger.warn(
        "resume-season-passes: Stripe nicht konfiguriert, skip (siehe STRIPE_SECRET_KEY)."
      );
      return { skipped: true, resumed: 0 };
    }
    const stripe = getStripe();
    const result = await resumeSeasonPassSubscriptions(new Date(), stripe);
    logger.info("resume-season-passes done", {
      resumed: result.resumed,
      clubIds: result.clubIds
    });
    return result;
  }
);
