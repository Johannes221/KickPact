-- Phase E2 / Task 4
-- Conflict-Claim extension on club_membership_requests.
--
-- Two new columns let a user request access *and* simultaneously claim that
-- the existing club account is an impersonator:
--   - is_conflict_claim:        flag, default false (regular access-request).
--   - conflict_doc_storage_key: S3-key of the Vereinsregister-Auszug (or
--                               other proof) that backs the claim.
--
-- Operator triage happens in /admin/conflicts (Task 6). Regular requests
-- (is_conflict_claim = false) keep flowing through the existing admin-inbox.

ALTER TABLE "club_membership_requests" ADD COLUMN "is_conflict_claim" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "club_membership_requests" ADD COLUMN "conflict_doc_storage_key" text;
