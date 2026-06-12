-- Saison-Features W2 (2026-06-12): Heim-/Auswärtssieg als eigene Regel-Typen.
-- Sponsoren können Heim- und Auswärtssiege getrennt (und unterschiedlich hoch)
-- bewerten — z.B. "5 € pro Heimsieg, 10 € pro Auswärtssieg".
--
-- ISOLIERT, weil ADD VALUE auf einen BESTEHENDEN Enum innerhalb derselben
-- Transaktion nicht sofort verwendet werden darf (From-Scratch-Test-Migrator
-- läuft in EINER Tx, vgl. Migration 0044). Diese Migration referenziert die
-- neuen Werte nirgends in DML — sie fügt sie nur hinzu. Verwendung erst zur
-- Laufzeit (App-Inserts).
ALTER TYPE "public"."trigger_type" ADD VALUE IF NOT EXISTS 'home_win';--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE IF NOT EXISTS 'away_win';
