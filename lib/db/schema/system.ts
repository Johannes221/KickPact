import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * Audit 2026-05-24 Phase 3 / Task 3.1: Stripe-Webhook-Idempotency.
 *
 * Stripe schickt bei Retries denselben Event nochmal, plus bei reorderten
 * Events kann ein älteres `subscription.updated` ein neueres überschreiben.
 * Vor dem Verarbeiten gated der Webhook über INSERT ON CONFLICT DO NOTHING
 * — event.id ist Stripe-eindeutig.
 */
export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow()
});

/**
 * Audit 2026-05-24 Phase 3 / Task 3.5: Mail-Dedupe für lifecycle-Reminders.
 *
 * season-end-reminders + trial-reminders + approval-reminders senden täglich,
 * aber pro (kind, key) soll nur 1× pro Stage gesendet werden.
 * `kind` z.B. "season-end-pledge", "trial-expired", "approval-expiring-7d";
 * `key` ist je nach kind eine pledge_id / club_id / approval_id / etc.
 *
 * INSERT ON CONFLICT DO NOTHING als Gate vor dem resend.emails.send.
 */
export const sentNotifications = pgTable(
  "sent_notifications",
  {
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.kind, t.key] })
  })
);
