-- Operator-Admin-Panel (Spec 2026-05-29) — Phase H-a: Crawler-Fehler-Diagnose.
-- Migration 0037 · 2026-05-29
--
-- Letzter Crawl-Fehler pro Team (Klartext + Zeitpunkt). Gesetzt vom
-- crawl-matches-Job bei Team-Fehlern, geleert beim nächsten erfolgreichen
-- Abschluss. Idempotent.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "crawl_last_error" text;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "crawl_last_error_at" timestamp with time zone;
