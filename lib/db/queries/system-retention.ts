/**
 * Retention für unbegrenzt wachsende System-Tabellen (Vibe-Check 2026-07-06).
 *
 * processed_stripe_events (Webhook-Idempotenz) und sent_notifications
 * (Mail-Dedupe) brauchen ihre Rows nur solange das jeweilige Dedupe-Fenster
 * offen ist: Stripe retryt Events max. ~3 Tage, alle Notification-Keys sind
 * zeit-/saisonsgebunden (Reminder-Fenster, Approval-Expiry 21d, Match-Push
 * direkt nach Spiel). 90 Tage sind damit weit auf der sicheren Seite.
 *
 * Aufgerufen vom täglichen expire-approvals-Cron (lifecycle-cleanup).
 */
import { lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { processedStripeEvents, sentNotifications } from "@/lib/db/schema";

export const SYSTEM_RETENTION_DAYS = 90;

export async function deleteExpiredSystemRows(
  now: Date
): Promise<{ stripeEvents: number; notifications: number }> {
  const cutoff = new Date(
    now.getTime() - SYSTEM_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const stripeEvents = await db
    .delete(processedStripeEvents)
    .where(lt(processedStripeEvents.processedAt, cutoff))
    .returning({ id: processedStripeEvents.eventId });
  const notifications = await db
    .delete(sentNotifications)
    .where(lt(sentNotifications.sentAt, cutoff))
    .returning({ key: sentNotifications.key });
  return { stripeEvents: stripeEvents.length, notifications: notifications.length };
}
