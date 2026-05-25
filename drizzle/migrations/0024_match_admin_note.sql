-- Plan 3 Teil 2: Match-Event-Editor + Saison-Renewal
--
-- Audit-Trail-Spalte für manuelle Admin-Eingriffe am Match. Wird vom
-- Match-Event-Editor (Edit/Delete) und vom Manuellen Ergebnis-Override
-- als JSON-Append-Log befüllt. Format siehe lib/db/schema/matches.ts.
--
-- Additive nullable column. Pre-existing matches behalten NULL.

ALTER TABLE "matches" ADD COLUMN "admin_note" text;
