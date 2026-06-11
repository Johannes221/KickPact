import { pgTable, text, timestamp, primaryKey, jsonb, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

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
 * season-renewal-prompts + trial-reminders + approval-reminders senden täglich,
 * aber pro (kind, key) soll nur 1× pro Stage gesendet werden.
 * `kind` z.B. "season-renewal", "trial-expired", "approval-expiring-7d";
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

/**
 * Operator-Admin-Panel (Spec 2026-05-29) — Phase B: Audit-Log.
 *
 * Append-only Protokoll JEDER mutierenden Operator-Aktion im /admin-Backoffice.
 * Pflicht-Querschnitt, weil der Operator fremde Accounts, Stammdaten, Geld und
 * Verifizierungen ändern kann — Nachvollziehbarkeit für Streit-/DSGVO-Fälle.
 *
 * `action` ist ein punkt-getrennter Slug (z.B. "verification.approve",
 * "club.block", "crawl.trigger"). `targetType`/`targetId` zeigen auf das
 * betroffene Objekt. `diffJson` hält optional Vorher/Nachher- oder Kontext-Daten.
 * Es gibt bewusst KEIN updatedAt/Delete — Einträge werden nie verändert.
 */
export const operatorAuditLog = pgTable(
  "operator_audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    operatorUserId: text("operator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    summary: text("summary").notNull(),
    diffJson: jsonb("diff_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    createdIdx: index("operator_audit_log_created_idx").on(t.createdAt),
    targetIdx: index("operator_audit_log_target_idx").on(t.targetType, t.targetId)
  })
);
