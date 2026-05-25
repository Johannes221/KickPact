-- Audit 2026-05-24 Phase 3 / Tasks 3.1 + 3.5
-- Zwei kleine Service-Tabellen für Idempotenz/Dedupe.

CREATE TABLE "processed_stripe_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "sent_notifications" (
  "kind" text NOT NULL,
  "key" text NOT NULL,
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sent_notifications_pk" PRIMARY KEY ("kind", "key")
);
