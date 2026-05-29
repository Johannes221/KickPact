-- Eigener Verein-Container pro Solo-Mannschaft
-- Migration 0030 · 2026-05-29
--
-- Spec: docs/superpowers/specs/2026-05-29-onboarding-identity-logic-design.md
--
-- Bisher war clubs.fussballde_verein_id UNIQUE — dadurch konnte es nur EINEN
-- Container pro realem Verein geben. Die neue Onboarding-Logik gibt jeder
-- Solo-Mannschaft einen eigenen Container (auch bei Namensgleichheit); ein
-- geteilter echter Verein entsteht erst über eine Vereinslizenz. Die Kollision
-- läuft jetzt über teams.fussballde_team_id, nicht über den Verein.
--
-- Wir droppen das Unique-Constraint und ersetzen es durch einen normalen Index
-- (Lookups für Kollisions-/Lizenz-Check bleiben schnell).

ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "clubs_fussballde_verein_id_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clubs_fussballde_verein_idx" ON "clubs" ("fussballde_verein_id");
