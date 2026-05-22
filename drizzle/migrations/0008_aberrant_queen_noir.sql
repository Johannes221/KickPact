ALTER TABLE "team_memberships" DROP CONSTRAINT "team_memberships_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_memberships" ALTER COLUMN "role" SET DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;