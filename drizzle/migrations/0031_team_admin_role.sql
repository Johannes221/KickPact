-- Team-Rollen & Nutzerverwaltung (Spec 2026-05-29) — Teil 1/3: Enum-Rename.
-- Migration 0031 · 2026-05-29
--
-- team_member_role: trainer -> admin (Mannschaftsadmin). Idempotent über
-- Existenz-Guard, damit ein erneuter Lauf nicht an einem bereits umbenannten
-- Enum scheitert. NUR der Rename — der Wert wird erst in 0033 verwendet
-- (Postgres: neue/geänderte Enum-Werte erst nach Commit nutzbar).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'team_member_role' AND e.enumlabel = 'trainer'
  ) THEN
    ALTER TYPE "team_member_role" RENAME VALUE 'trainer' TO 'admin';
  END IF;
END $$;
