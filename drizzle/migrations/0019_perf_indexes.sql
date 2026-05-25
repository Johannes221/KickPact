-- Audit 2026-05-24 Phase 5 / Task 5.1: Performance-Indexes auf FK-Spalten.
--
-- Identifizierte fehlende Indexes (DSGVO+Performance-Review):
-- - charges(match_id, invoice_id) — dashboard scan
-- - invoice_items(invoice_id, charge_id) — invoice rendering
-- - players(team_id) — team player listing
-- - club_memberships(user_id) — getClubMembershipsByUserId scan
-- - event_approvals(match_event_id) — invalidate-flow + lifecycle-cleanup
-- - sponsor_invitations(status) — pending-listing
--
-- IF NOT EXISTS überall, damit die Migration auf einer DB, in der einzelne
-- Indexes vielleicht schon vom anderen Agent angelegt wurden, nicht crasht.

CREATE INDEX IF NOT EXISTS "charges_match_idx" ON "charges" ("match_id") WHERE "match_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charges_invoice_idx" ON "charges" ("invoice_id") WHERE "invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_items_invoice_idx" ON "invoice_items" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_items_charge_idx" ON "invoice_items" ("charge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_team_idx" ON "players" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_memberships_user_idx" ON "club_memberships" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_approvals_match_event_idx" ON "event_approvals" ("match_event_id") WHERE "match_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsor_invitations_status_idx" ON "sponsor_invitations" ("status");
