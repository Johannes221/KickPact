-- Audit 2026-05-24 Phase 4 / Task 4.2: Account-Löschung (Art. 17 DSGVO).
-- Marker-Spalte für User-initiierte Löschanfrage. Anonymisierungs-Cron
-- liest diese Spalte täglich und löscht Accounts 14d nach Setzung.
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;
