import "server-only";
import { eq, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  subscriptions,
  teamLicenses,
  teams,
  clubs,
  processedStripeEvents
} from "@/lib/db/schema";
import type { SubscriptionStatus } from "./subscription-status";
import type { PlanKey, BillingCycle } from "@/lib/stripe/pricing";

/**
 * Query-Layer für Subscription-/Lizenz-Writes aus dem Stripe-Webhook.
 * Bündelt alle DB-Zugriffe, die vorher inline im Route-Handler standen
 * (app/api/stripe/webhook/route.ts) — Verhalten unverändert, nur ausgelagert.
 */

/**
 * Idempotency-Gate: schreibt den Stripe-Event atomar (INSERT … ON CONFLICT DO
 * NOTHING + RETURNING). `true`, wenn der Event NEU ist (= soll verarbeitet
 * werden), `false` bei einem Duplikat (Retry / reordered Delivery).
 */
export async function markStripeEventProcessed(
  eventId: string,
  eventType: string
): Promise<boolean> {
  const inserted = await db
    .insert(processedStripeEvents)
    .values({ eventId, eventType })
    .onConflictDoNothing()
    .returning({ eventId: processedStripeEvents.eventId });
  return inserted.length > 0;
}

/**
 * Stripe-Customer-ID der Subscription-Row eines Clubs (für die M4-Prüfung
 * clubId↔Customer). `undefined`, wenn der Club keine Subscription-Row hat.
 */
export async function getSubscriptionCustomerId(
  clubId: string
): Promise<{ customerId: string | null } | undefined> {
  const [row] = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.clubId, clubId))
    .limit(1);
  return row;
}

export interface StripeSubscriptionSync {
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  /** Nur setzen, wenn aus dem Stripe-Price ableitbar (sonst weglassen). */
  billingCycle?: BillingCycle;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  pausedUntil: Date | null;
}

/** Spiegelt den Stripe-Subscription-Stand in die DB (created/updated). */
export async function syncSubscriptionForClub(
  clubId: string,
  patch: StripeSubscriptionSync
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      stripeSubscriptionId: patch.stripeSubscriptionId,
      status: patch.status,
      ...(patch.billingCycle ? { billingCycle: patch.billingCycle } : {}),
      trialEndsAt: patch.trialEndsAt,
      currentPeriodEnd: patch.currentPeriodEnd,
      pausedUntil: patch.pausedUntil,
      updatedAt: new Date()
    })
    .where(eq(subscriptions.clubId, clubId));
}

/** Spiegelt den Plan auf ALLE License-Rows dieser Subscription (Verein-Plan). */
export async function setTeamLicensesPlanForSubscription(
  clubId: string,
  plan: PlanKey
): Promise<void> {
  await db
    .update(teamLicenses)
    .set({ plan })
    .where(eq(teamLicenses.subscriptionClubId, clubId));
}

/** Setzt die Subscription eines Clubs auf cancelled (subscription.deleted). */
export async function cancelSubscriptionForClub(clubId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptions.clubId, clubId));
}

/** Setzt den Status aller team_licenses der Teams eines Clubs. */
export async function setTeamLicensesStatusForClubTeams(
  clubId: string,
  status: "active" | "cancelled"
): Promise<void> {
  await db
    .update(teamLicenses)
    .set({ status })
    .where(
      inArray(
        teamLicenses.teamId,
        db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId))
      )
    );
}

/** Setzt den Subscription-Status anhand der Stripe-Customer-ID (invoice events). */
export async function setSubscriptionStatusByCustomer(
  customerId: string,
  status: SubscriptionStatus
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.stripeCustomerId, customerId));
}

/** clubId der Subscription mit dieser Stripe-Customer-ID (invoice.paid). */
export async function getClubIdByCustomer(
  customerId: string
): Promise<string | null> {
  const [sub] = await db
    .select({ clubId: subscriptions.clubId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  return sub?.clubId ?? null;
}

/** Past-Due-Subscriptions fürs Admin-Stripe-Panel, mit Club-Drill-Down. */
export async function listPastDueSubscriptions() {
  return db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      billingCycle: subscriptions.billingCycle,
      updatedAt: subscriptions.updatedAt
    })
    .from(subscriptions)
    .innerJoin(clubs, eq(clubs.id, subscriptions.clubId))
    .where(eq(subscriptions.status, "past_due"))
    .orderBy(desc(subscriptions.updatedAt));
}

/** Incomplete-Subscriptions (Checkout angefangen, nicht abgeschlossen). */
export async function listIncompleteSubscriptions() {
  return db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      stripeCustomerId: subscriptions.stripeCustomerId,
      updatedAt: subscriptions.updatedAt
    })
    .from(subscriptions)
    .innerJoin(clubs, eq(clubs.id, subscriptions.clubId))
    .where(eq(subscriptions.status, "incomplete"))
    .orderBy(desc(subscriptions.updatedAt));
}

/** Letzte N verarbeitete Stripe-Webhook-Events (Admin-Audit-Liste). */
export async function listRecentStripeEvents(limit = 10) {
  return db
    .select()
    .from(processedStripeEvents)
    .orderBy(desc(processedStripeEvents.processedAt))
    .limit(limit);
}
