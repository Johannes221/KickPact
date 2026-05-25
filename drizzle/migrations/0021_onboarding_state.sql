-- Phase O1: Onboarding-State on clubs
--
-- Plan: docs/superpowers/plans/2026-05-25-onboarding-rebuild.md (§4 Schema-Migration)
--
-- Adds explicit onboarding lifecycle tracking so users can resume the wizard
-- mid-flow instead of getting trapped in the "Wie willst du starten?" chooser
-- when finalize() never ran (e.g. PDF-upload error in old Step 4 killed the
-- session before any DB writes happened).
--
-- State machine: draft → stammdaten_complete → completed
-- Role: which wizard the club went through (mannschaft = single-team/Pro-Trial,
--       verein = multi-team/Vereinslizenz-Trial)
--
-- Defaults are 'completed' / 'verein' so all existing production clubs are
-- backwards-compatible. Backfill sets onboarding_completed_at = created_at
-- for the audit trail.

CREATE TYPE "onboarding_status" AS ENUM ('draft', 'stammdaten_complete', 'completed');
--> statement-breakpoint
CREATE TYPE "onboarding_role" AS ENUM ('mannschaft', 'verein');
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "onboarding_status" "onboarding_status" DEFAULT 'completed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "onboarding_role" "onboarding_role" DEFAULT 'verein' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "onboarding_started_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "clubs" SET "onboarding_completed_at" = "created_at" WHERE "onboarding_completed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "clubs_draft_idx" ON "clubs" ("onboarding_status") WHERE "onboarding_status" != 'completed';
