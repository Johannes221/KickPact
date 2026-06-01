-- Feedback #8/#9: Öffentliches Mannschafts-Profil (/m/{slug}).
-- Siehe docs/superpowers/specs/2026-06-01-public-team-profile.md
--
-- Hand-geschrieben, weil das Drizzle-Snapshot-Meta (0012+) historisch
-- korrumpiert ist und `drizzle-kit generate` blockiert. Der Migrate-Runner
-- (drizzle-kit migrate) nutzt nur Journal + SQL, daher reicht diese Datei
-- plus der Journal-Eintrag. Alle Statements additiv/idempotent.

-- 1. Public-Profil-Felder auf teams (additiv, nullable).
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "public_slug" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "public_name" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "public_goals" text;--> statement-breakpoint

-- 2. Eindeutiger Slug (nur wo gesetzt) für /m/{slug}-Routing.
CREATE UNIQUE INDEX IF NOT EXISTS "teams_public_slug_idx" ON "teams" ("public_slug") WHERE "public_slug" IS NOT NULL;--> statement-breakpoint

-- 3. Öffentliche Sponsoring-Anfragen (Leads) von nicht eingeloggten Besuchern.
CREATE TABLE IF NOT EXISTS "sponsor_leads" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "handled_at" timestamp with time zone
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "sponsor_leads" ADD CONSTRAINT "sponsor_leads_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sponsor_leads_team_idx" ON "sponsor_leads" ("team_id","created_at");
