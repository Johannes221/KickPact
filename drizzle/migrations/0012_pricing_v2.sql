CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'season', 'annual');--> statement-breakpoint
ALTER TYPE "public"."license_status" ADD VALUE 'paused';--> statement-breakpoint
ALTER TYPE "public"."plan" ADD VALUE 'verein';--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'paused';--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"region" text DEFAULT 'DFB' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"matchday_5_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_licenses" ADD COLUMN "parent_club_license_id" text;--> statement-breakpoint
CREATE INDEX "seasons_range_idx" ON "seasons" USING btree ("starts_at","ends_at");--> statement-breakpoint
ALTER TABLE "team_licenses" ADD CONSTRAINT "team_licenses_parent_club_license_id_team_licenses_id_fk" FOREIGN KEY ("parent_club_license_id") REFERENCES "public"."team_licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_licenses_parent_idx" ON "team_licenses" USING btree ("parent_club_license_id");