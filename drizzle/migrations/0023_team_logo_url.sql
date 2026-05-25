-- Plan 3 Teil 1: Mannschafts-Lifecycle
-- Team-Logo Upload (DSGVO-konformes Self-Service-Asset, gespeichert via
-- lib/storage/documents.ts in R2 oder lokalem Volume).
--
-- Additive nullable column. Existing teams behalten NULL bis der
-- Club-Admin in den Team-Einstellungen ein Logo hochlädt.

ALTER TABLE "teams" ADD COLUMN "logo_url" text;
