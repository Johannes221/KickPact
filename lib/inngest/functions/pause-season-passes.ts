import { inngest } from "@/lib/inngest/client";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { pauseSeasonPassSubscriptions } from "@/lib/billing/season-pass";

/**
 * Sommerpause-Start: 1. Juni, 02:00 UTC.
 *
 * Setzt alle Saison-Pass-Subscriptions (`billing_cycle = 'season_end'`) auf `paused`,
 * triggert Stripe `pause_collection={behavior:'keep_as_draft'}`, spiegelt `team_licenses.status`.
 */
export const pauseSeasonPasses = inngest.createFunction(
  { id: "pause-season-passes", name: "Sommerpause: Saison-Pass pausieren (1.6.)", concurrency: { limit: 1, key: "season-pass-lifecycle" } },
  [{ cron: "0 2 1 6 *" }, { event: "subscriptions/pause-season-passes-test" }],
  async ({ logger }) => {
    if (!isStripeConfigured()) {
      logger.warn(
        "pause-season-passes: Stripe nicht konfiguriert, skip (siehe STRIPE_SECRET_KEY)."
      );
      return { skipped: true, paused: 0 };
    }
    const stripe = getStripe();
    const result = await pauseSeasonPassSubscriptions(new Date(), stripe);
    logger.info("pause-season-passes done", {
      paused: result.paused,
      clubIds: result.clubIds
    });
    return result;
  }
);
