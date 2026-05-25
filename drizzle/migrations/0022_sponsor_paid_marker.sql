-- Phase E3 / Task 2
-- Sponsor self-mark "Habe bezahlt" toggle.
--
-- Additive nullable timestamp on invoices. Set when the sponsor clicks
-- the "Habe bezahlt"-Toggle in their invoice list. Does NOT replace the
-- Verein-side `paid_marked_at` confirmation — KickPact is non-custodial
-- and the Verein is the single source of truth for "money arrived".
--
-- UI status combinatorics:
--   paid_marked_at IS NOT NULL                                              → "Bezahlt (Verein bestätigt)"
--   marked_paid_by_sponsor_at IS NOT NULL AND paid_marked_at IS NULL        → "Bezahlt (warte auf Verein)"
--   else                                                                    → "Offen"

ALTER TABLE "invoices" ADD COLUMN "marked_paid_by_sponsor_at" timestamp with time zone;
