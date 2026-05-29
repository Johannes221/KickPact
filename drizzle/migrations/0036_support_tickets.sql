-- Operator-Admin-Panel (Spec 2026-05-29) — Phase C: Support-Inbox.
-- Migration 0036 · 2026-05-29
--
-- Eingehende Hilfe-/Kontaktanfragen + Operator-Antwort-Verlauf. Enums via
-- DO-Block-Guard (CREATE TYPE kennt kein IF NOT EXISTS); Tabellen via
-- CREATE TABLE IF NOT EXISTS mit inline-FKs. Frisch erzeugte Enum-TYPES sind
-- innerhalb derselben Transaktion sofort nutzbar (anders als ADD VALUE auf
-- bestehende Enums) — daher hier unproblematisch für den From-Scratch-Migrator.
DO $$ BEGIN
  CREATE TYPE "support_ticket_category" AS ENUM ('frage', 'bug', 'abrechnung', 'sonstiges');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "support_ticket_status" AS ENUM ('open', 'in_progress', 'waiting', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "category" "support_ticket_category" DEFAULT 'frage' NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "status" "support_ticket_status" DEFAULT 'open' NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "club_id" text REFERENCES "clubs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "support_ticket_replies" (
  "id" text PRIMARY KEY NOT NULL,
  "ticket_id" text NOT NULL REFERENCES "support_tickets"("id") ON DELETE cascade,
  "operator_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "body" text NOT NULL,
  "mail_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "support_tickets_created_idx" ON "support_tickets" ("created_at");
CREATE INDEX IF NOT EXISTS "support_ticket_replies_ticket_idx" ON "support_ticket_replies" ("ticket_id", "created_at");
