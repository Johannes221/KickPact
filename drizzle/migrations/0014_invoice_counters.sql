-- Audit 2026-05-24 Phase 2 / Task 2.1
-- Race-safe Invoice-Sequenz pro (club, year).
--
-- Vorher: lib/invoicing/numbering.ts machte `COUNT(*)+1` ohne Lock.
-- Zwei parallele Cron+Manual-Runs konnten identische `KP-2026-0001`
-- erzeugen, danach R2-PUT überschrieb → Sponsor A bekam PDF von B.
--
-- Diese Tabelle hält den letzten ausgegebenen Counter pro (club, year).
-- Update über atomic INSERT … ON CONFLICT DO UPDATE SET counter+1
-- RETURNING counter — race-safe ohne explicit lock.

CREATE TABLE "invoice_counters" (
  "club_id" text NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "counter" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoice_counters_pk" PRIMARY KEY ("club_id", "year")
);
--> statement-breakpoint
-- Backfill: für jeden existierenden Club + Jahr aus dem invoices-Bestand
-- den Max-Counter aus den vorhandenen Rechnungsnummern berechnen.
-- Pattern KP-<year>-<NNNN> → letzte 4 Ziffern.
-- Wenn keine invoices da sind → kein Insert nötig (Tabelle bleibt leer,
-- bei nextInvoiceNumber wird auf 0+1=1 gestartet).
INSERT INTO "invoice_counters" ("club_id", "year", "counter")
SELECT
  i."club_id",
  EXTRACT(YEAR FROM i."created_at")::int AS year,
  MAX(
    CASE
      WHEN i."pdf_url" IS NOT NULL AND i."pdf_url" ~ 'KP-\d{4}-(\d{4})\.pdf'
        THEN (regexp_match(i."pdf_url", 'KP-\d{4}-(\d{4})'))[1]::int
      ELSE 0
    END
  ) AS counter
FROM "invoices" i
GROUP BY i."club_id", EXTRACT(YEAR FROM i."created_at")
ON CONFLICT ("club_id", "year") DO NOTHING;
