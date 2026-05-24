-- club_request_unique_pending_idx → NULLS NOT DISTINCT
-- Postgres treats NULLs as distinct in unique indexes by default, so the
-- partial unique index alone did NOT block duplicate pending CLUB-WIDE
-- requests (where requested_team_id IS NULL). With PG15+ NULLS NOT DISTINCT
-- the constraint now covers that case at the DB level, removing the need
-- for the JS-level isNull pre-check in createRequest().
--
-- Hand-written migration: drizzle-kit's uniqueIndex() builder does not yet
-- expose .nullsNotDistinct() (only the table-level unique() does), so we
-- DROP + recreate the index manually.
DROP INDEX IF EXISTS "club_request_unique_pending_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "club_request_unique_pending_idx"
  ON "club_membership_requests"
  USING btree ("user_id","club_id","requested_team_id")
  NULLS NOT DISTINCT
  WHERE "club_membership_requests"."status" = 'pending';
