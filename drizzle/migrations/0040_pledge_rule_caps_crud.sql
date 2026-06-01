-- Pledge-Rule Perioden-Cap + Soft-Delete (Folge des E2E-Tests 2026-06-01).
-- Migration 0040 · 2026-06-01
--
-- 1) Ersetzt den Pro-Spiel-Cap (`per_match_cap_cents`) durch einen Cap pro Wette
--    mit Perioden-Wahl: `cap_cents` + `cap_period` ('month' | 'season').
-- 2) `active`-Flag für Soft-Delete von Wetten. Hintergrund: charges.pledge_rule_id
--    ist ON DELETE CASCADE → ein Hard-Delete würde bereits verbuchte
--    Vergangenheits-Charges mitlöschen. Löschen = active=false setzen.
--
-- Additiv + idempotent (ADD COLUMN IF NOT EXISTS, WHERE-guards). Kein Snapshot
-- (Repo pflegt Snapshots seit 0013 nicht mehr; Migrationen werden hand-geschrieben).

ALTER TABLE "pledge_rules" ADD COLUMN IF NOT EXISTS "cap_cents" integer;
ALTER TABLE "pledge_rules" ADD COLUMN IF NOT EXISTS "cap_period" text;
ALTER TABLE "pledge_rules" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;

-- Bestehende Pro-Spiel-Caps als Monats-Cap übernehmen …
UPDATE "pledge_rules"
SET "cap_cents" = "per_match_cap_cents", "cap_period" = 'month'
WHERE "per_match_cap_cents" IS NOT NULL AND "cap_cents" IS NULL;

-- … und danach per_match_cap_cents räumen (Doppel-Capping vermeiden).
UPDATE "pledge_rules"
SET "per_match_cap_cents" = NULL
WHERE "per_match_cap_cents" IS NOT NULL AND "cap_cents" IS NOT NULL;
