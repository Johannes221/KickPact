-- Paket B / Spec 2026-05-26-v1-final-scope-consolidation §1.7
-- Team Verifications: Nachweis-Pflicht für Mannschafts-Onboarding ohne
-- Vereins-Admin-Status. Analog club_verifications.
--
-- Sicherheitsrisiko vor diesem Patch: Fremder konnte fremde Mannschaft
-- anlegen + Sponsoren einsammeln. teams.verified_at gated nun den
-- Rechnungs-Versand (Withhold-Pattern). Plattform-Admin reviewt in
-- /admin/verifications.

CREATE TYPE "public"."team_verification_status" AS ENUM(
  'pending', 'approved', 'rejected', 'revoked'
);
--> statement-breakpoint

CREATE TYPE "public"."team_verification_doc_type" AS ENUM(
  'trainer_license',
  'club_letter',
  'team_photo',
  'fussballde_entry',
  'sonstiges'
);
--> statement-breakpoint

ALTER TABLE "teams" ADD COLUMN "verified_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE "team_verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "submitted_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "doc_type" "team_verification_doc_type" NOT NULL,
  "doc_filename" text NOT NULL,
  "doc_storage_key" text NOT NULL,
  "doc_mime_type" text NOT NULL,
  "doc_size_bytes" integer NOT NULL,
  "submitter_role" text NOT NULL,
  "submitter_full_name" text NOT NULL,
  "submitter_notes" text,
  "status" "team_verification_status" NOT NULL DEFAULT 'pending',
  "reviewed_at" timestamp with time zone,
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "rejection_reason" text,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "team_verifications_team_status_idx"
  ON "team_verifications" USING btree ("team_id", "status");
--> statement-breakpoint

CREATE INDEX "team_verifications_pending_idx"
  ON "team_verifications" USING btree ("submitted_at")
  WHERE "status" = 'pending';
