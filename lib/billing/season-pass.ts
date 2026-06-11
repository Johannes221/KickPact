import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { subscriptions, teamLicenses } from "@/lib/db/schema";

/**
 * Saison-Pass-Lifecycle.
 *
 * Pause: 1.6. — alle `billing_cycle = 'season_end'` Subscriptions mit Status
 * `active` werden auf `paused` gesetzt + Stripe
 * `pause_collection={behavior:'keep_as_draft'}` (Audit 2026-06-11 / A6:
 * `void` ließ Renewal-Invoices mit Sommer-Anniversary ersatzlos verfallen —
 * `keep_as_draft` hält sie als Draft und finalisiert beim Resume).
 *
 * Resume: 1.8. — Pausen werden aufgehoben.
 *
 * Team-Licenses spiegeln den Status (für Crawler-Filter).
 */

/** Minimaler Stripe-Client-Surface für Pause/Resume (DI-fähig in Tests). */
export interface StripeSubscriptionPauseClient {
  subscriptions: {
    update(
      id: string,
      params: {
        pause_collection?: { behavior: "keep_as_draft" } | null;
      }
    ): Promise<Stripe.Subscription | Pick<Stripe.Subscription, "id">>;
  };
}

import { nextAugustFirst } from "./season-pass-dates";
export { nextAugustFirst };

export async function pauseSeasonPassSubscriptions(
  now: Date,
  stripe: StripeSubscriptionPauseClient
): Promise<{ paused: number; clubIds: string[] }> {
  const candidates = await db
    .select({
      clubId: subscriptions.clubId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.billingCycle, "season_end"),
        eq(subscriptions.status, "active")
      )
    );

  if (candidates.length === 0) return { paused: 0, clubIds: [] };

  const pausedUntil = nextAugustFirst(now);
  const pausedClubIds: string[] = [];

  for (const c of candidates) {
    if (c.stripeSubscriptionId) {
      await stripe.subscriptions.update(c.stripeSubscriptionId, {
        pause_collection: { behavior: "keep_as_draft" }
      });
    }
    pausedClubIds.push(c.clubId);
  }

  await db
    .update(subscriptions)
    .set({ status: "paused", pausedUntil, updatedAt: new Date() })
    .where(inArray(subscriptions.clubId, pausedClubIds));

  await db
    .update(teamLicenses)
    .set({ status: "paused" })
    .where(inArray(teamLicenses.subscriptionClubId, pausedClubIds));

  return { paused: pausedClubIds.length, clubIds: pausedClubIds };
}

export async function resumeSeasonPassSubscriptions(
  _now: Date,
  stripe: StripeSubscriptionPauseClient
): Promise<{ resumed: number; clubIds: string[] }> {
  const candidates = await db
    .select({
      clubId: subscriptions.clubId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.billingCycle, "season_end"),
        eq(subscriptions.status, "paused")
      )
    );

  if (candidates.length === 0) return { resumed: 0, clubIds: [] };

  const resumedClubIds: string[] = [];
  for (const c of candidates) {
    if (c.stripeSubscriptionId) {
      await stripe.subscriptions.update(c.stripeSubscriptionId, {
        pause_collection: null
      });
    }
    resumedClubIds.push(c.clubId);
  }

  await db
    .update(subscriptions)
    .set({ status: "active", pausedUntil: null, updatedAt: new Date() })
    .where(inArray(subscriptions.clubId, resumedClubIds));

  await db
    .update(teamLicenses)
    .set({ status: "active" })
    .where(inArray(teamLicenses.subscriptionClubId, resumedClubIds));

  return { resumed: resumedClubIds.length, clubIds: resumedClubIds };
}
