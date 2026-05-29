-- Operator-Admin-Panel (Spec 2026-05-29) — Phase B: Audit-Log.
-- Migration 0035 · 2026-05-29
--
-- Append-only Protokoll aller mutierenden Operator-Aktionen. FK inline, damit
-- Tabelle + Constraint atomar entstehen und IF NOT EXISTS die volle
-- Idempotenz abdeckt (auch im From-Scratch-Test-Migrator).
CREATE TABLE IF NOT EXISTS "operator_audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "operator_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "summary" text NOT NULL,
  "diff_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "operator_audit_log_created_idx" ON "operator_audit_log" ("created_at");
CREATE INDEX IF NOT EXISTS "operator_audit_log_target_idx" ON "operator_audit_log" ("target_type", "target_id");
