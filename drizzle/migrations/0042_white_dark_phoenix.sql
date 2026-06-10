CREATE TABLE IF NOT EXISTS "team_images" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "cover_url" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "show_insights" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "league" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "team_images" ADD CONSTRAINT "team_images_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_images_team_sort_idx" ON "team_images" USING btree ("team_id","sort_order");