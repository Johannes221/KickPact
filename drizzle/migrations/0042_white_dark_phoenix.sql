CREATE TABLE "team_images" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "show_insights" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "league" text;--> statement-breakpoint
ALTER TABLE "team_images" ADD CONSTRAINT "team_images_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_images_team_sort_idx" ON "team_images" USING btree ("team_id","sort_order");