-- Report-a-Problem / Support-Workflow — Teil 2/2: Workflow-Felder.
-- Migration 0045 · 2026-06-02
--
-- Hand-geschrieben (Drizzle-Snapshot-Meta 0012+ ist korrumpiert; der
-- migrate-Runner nutzt nur Journal + SQL). Alle Statements additiv/idempotent.
-- Neue Enum-TYPES via DO-Block (CREATE TYPE kennt kein IF NOT EXISTS); frisch
-- erzeugte Typen sind in derselben Tx sofort nutzbar (anders als ADD VALUE).
-- Referenziert NICHT den in 0044 ergänzten Kategorie-Wert 'spieldaten'.

-- 1. Neue Enums.
DO $$ BEGIN
  CREATE TYPE "support_ticket_priority" AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "support_context_type" AS ENUM ('none', 'match', 'invoice', 'pledge', 'team', 'page');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "support_reply_author" AS ENUM ('operator', 'customer', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- 2. Neue Spalten auf support_tickets.
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "priority" "support_ticket_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "team_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "context_type" "support_context_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "context_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "context_url" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "context_meta" jsonb;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "last_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "last_reply_by" "support_reply_author";--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint

-- 3. FKs für team_id + assigned_to_user_id (set null → Historie bleibt erhalten).
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_user_id_users_id_fk"
    FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- 4. Neue Spalten auf support_ticket_replies.
ALTER TABLE "support_ticket_replies" ADD COLUMN IF NOT EXISTS "author_type" "support_reply_author" DEFAULT 'operator' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD COLUMN IF NOT EXISTS "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 5. Queue-Indizes.
CREATE INDEX IF NOT EXISTS "support_tickets_assignee_idx" ON "support_tickets" ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_priority_idx" ON "support_tickets" ("priority","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_user_idx" ON "support_tickets" ("user_id","created_at");
