CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'used', 'revoked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"team_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	CONSTRAINT "sponsor_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sponsor_invitations" ADD CONSTRAINT "sponsor_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sponsor_invitations" ADD CONSTRAINT "sponsor_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sponsor_invitations" ADD CONSTRAINT "sponsor_invitations_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
