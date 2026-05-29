-- Operator-Admin-Panel (Spec 2026-05-29) — Phase J: echte Storno-Rechnung.
-- Migration 0038 · 2026-05-29
--
-- Storno (Gutschrift) als eigene invoices-Zeile mit negativem Betrag, die per
-- reversal_of_invoice_id auf die Original-Rechnung verweist; die Original-Zeile
-- wird via cancelled_at als storniert markiert. Der Unique-Index
-- (sponsor,club,period) wird partiell (nur Nicht-Storno-Zeilen), damit die
-- Storno-Zeile dieselbe Periode wie das Original tragen darf. Idempotent.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "reversal_of_invoice_id" text;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_reversal_of_invoice_id_fk"
    FOREIGN KEY ("reversal_of_invoice_id") REFERENCES "invoices"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DROP INDEX IF EXISTS "invoices_sponsor_club_period_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_sponsor_club_period_idx"
  ON "invoices" ("sponsor_id", "club_id", "period")
  WHERE "reversal_of_invoice_id" IS NULL;
