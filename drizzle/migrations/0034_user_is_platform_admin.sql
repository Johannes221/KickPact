-- Operator-Admin-Panel (Spec 2026-05-29) — Phase A: Operator-Passwort-Login.
-- Migration 0034 · 2026-05-29
--
-- Plattform-Operator-Flag auf users. Ersetzt die ENV-Allowlist
-- KICKPACT_ADMIN_EMAILS als Source-of-Truth für /admin-Zugang. Default false,
-- idempotent (IF NOT EXISTS), damit Re-Runs und der From-Scratch-Test-Migrator
-- nicht scheitern. Befüllt wird die Spalte separat (Seed/manuell), nie
-- self-service.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_platform_admin" boolean NOT NULL DEFAULT false;
