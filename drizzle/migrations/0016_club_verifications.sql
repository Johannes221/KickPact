-- Phase E1 / Task 1
-- Club Verifications: proof-of-representation documents for clubs.
--
-- New table `club_verifications` tracks document uploads (Vereinsregister,
-- Vorstandsbeschluss, etc.). Denormalized `clubs.verified_at` is the fast
-- read-path for gating UI and invoice generation. `invoice_status` gets a
-- new `withheld` value so unverified clubs accumulate invoices without
-- mails going out.

CREATE TYPE "public"."club_verification_status" AS ENUM(
  'pending', 'approved', 'rejected', 'revoked'
);
--> statement-breakpoint

CREATE TYPE "public"."club_verification_doc_type" AS ENUM(
  'vereinsregister_auszug',
  'vorstands_beschluss',
  'vereinssatzung',
  'mitgliederversammlung_protokoll',
  'sonstiges'
);
--> statement-breakpoint

-- Postgres requires ALTER TYPE ... ADD VALUE outside of a transaction
-- block. Drizzle's runner splits on the breakpoint marker and runs each
-- segment in its own statement, which satisfies this requirement.
ALTER TYPE "public"."invoice_status" ADD VALUE 'withheld';
--> statement-breakpoint

ALTER TABLE "clubs" ADD COLUMN "verified_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE "club_verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "club_id" text NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "submitted_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "doc_type" "club_verification_doc_type" NOT NULL,
  "doc_filename" text NOT NULL,
  "doc_storage_key" text NOT NULL,
  "doc_mime_type" text NOT NULL,
  "doc_size_bytes" integer NOT NULL,
  "submitter_role" text NOT NULL,
  "submitter_full_name" text NOT NULL,
  "submitter_notes" text,
  "status" "club_verification_status" NOT NULL DEFAULT 'pending',
  "reviewed_at" timestamp with time zone,
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "rejection_reason" text,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "club_verifications_club_status_idx"
  ON "club_verifications" USING btree ("club_id", "status");
--> statement-breakpoint

CREATE INDEX "club_verifications_pending_idx"
  ON "club_verifications" USING btree ("submitted_at")
  WHERE "status" = 'pending';
