-- Benachrichtigungs-System (Spec docs/superpowers/specs/2026-06-02-ios-push-notifications.md).
-- NUR native iOS-Push (APNs) + In-App-Inbox. Kein Web-Push / kein VAPID.
--
-- Hand-geschrieben, weil das Drizzle-Snapshot-Meta (0012+) korrumpiert ist und
-- `drizzle-kit generate` blockiert. Der Migrate-Runner (drizzle-kit migrate +
-- der Test-Migrator) nutzt nur Journal + SQL. Alle Statements additiv/idempotent.
--
-- Nummerierung 0045 (statt 0043): 0043/0044 sind parallel vom Support-Workflow-
-- Feature belegt — diese Migration weicht aus, um Datei-Kollisionen zu vermeiden.

-- 1. notification_type Enum (frisch erzeugt -> sofort im selben Tx nutzbar).
DO $$ BEGIN
  CREATE TYPE "notification_type" AS ENUM (
    'match_result', 'access_request', 'sponsor_inquiry',
    'sponsor_lead', 'invoice_created', 'trial_ending'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- 2. device_tokens — registrierte APNs-Tokens (token = natürlicher PK).
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "platform" text DEFAULT 'ios' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "device_tokens_user_idx" ON "device_tokens" ("user_id");--> statement-breakpoint

-- 3. notifications — In-App-Inbox (wird immer geschrieben, unabhängig vom Push-Toggle).
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "data_json" jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" ("user_id","created_at");--> statement-breakpoint

-- 4. notification_settings — Pro-User Push-Präferenzen. Opt-out: fehlende Zeile = alles an.
CREATE TABLE IF NOT EXISTS "notification_settings" (
  "user_id" text PRIMARY KEY NOT NULL,
  "match_results" boolean DEFAULT true NOT NULL,
  "access_requests" boolean DEFAULT true NOT NULL,
  "sponsor_requests" boolean DEFAULT true NOT NULL,
  "billing" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
