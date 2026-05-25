-- Bug #8 / Workstream A: Trainer- und Viewer-Onboarding via Invite-Token.
-- Erweitert `sponsor_invitations` um `kind`, `role`, `club_id`, `recipient_email`.
-- Bisheriger Sponsor-Flow bleibt unverändert: `kind = 'sponsor'` ist Default.

-- Enums erstellen (idempotent)
DO $$ BEGIN
  CREATE TYPE "invitation_kind" AS ENUM ('sponsor', 'team-member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "invitation_role" AS ENUM ('trainer', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Neue Spalten
ALTER TABLE "sponsor_invitations"
  ADD COLUMN IF NOT EXISTS "kind" "invitation_kind" NOT NULL DEFAULT 'sponsor';

ALTER TABLE "sponsor_invitations"
  ADD COLUMN IF NOT EXISTS "club_id" text;

ALTER TABLE "sponsor_invitations"
  ADD COLUMN IF NOT EXISTS "role" "invitation_role";

ALTER TABLE "sponsor_invitations"
  ADD COLUMN IF NOT EXISTS "recipient_email" text;

-- team_id darf jetzt NULL sein (für club-wide team-member invites)
ALTER TABLE "sponsor_invitations"
  ALTER COLUMN "team_id" DROP NOT NULL;

-- FK auf clubs (nur falls noch nicht vorhanden)
DO $$ BEGIN
  ALTER TABLE "sponsor_invitations"
    ADD CONSTRAINT "sponsor_invitations_club_id_clubs_id_fk"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Sanity: ein team-member-Invite muss entweder team_id ODER club_id setzen,
-- ein sponsor-Invite muss team_id haben. Constraint ist tolerant zu Legacy-Rows
-- (`kind = sponsor` mit team_id != NULL gilt weiter).
DO $$ BEGIN
  ALTER TABLE "sponsor_invitations" ADD CONSTRAINT "invitations_scope_check" CHECK (
    (kind = 'sponsor' AND team_id IS NOT NULL AND role IS NULL)
    OR
    (kind = 'team-member' AND role IS NOT NULL AND (team_id IS NOT NULL OR club_id IS NOT NULL))
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
