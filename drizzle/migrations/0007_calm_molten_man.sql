CREATE TYPE "public"."team_member_role" AS ENUM('trainer', 'viewer');--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'trainer' NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_memberships_team_idx" ON "team_memberships" USING btree ("team_id");