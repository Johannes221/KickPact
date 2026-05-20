ALTER TYPE "public"."trigger_type" ADD VALUE 'season_promotion';--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE 'season_no_relegation';--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE 'season_table_position';--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE 'season_champion';--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE 'season_cup_round';--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE 'season_custom';--> statement-breakpoint
CREATE TABLE "season_results" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"saison" text NOT NULL,
	"final_position" integer,
	"teams_in_league" integer,
	"promoted" boolean DEFAULT false NOT NULL,
	"relegated" boolean DEFAULT false NOT NULL,
	"cup_round_reached" text,
	"custom_notes" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "charges_unique_match_trigger_idx";--> statement-breakpoint
ALTER TABLE "charges" ALTER COLUMN "match_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "saison" text;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "season_results_team_saison_idx" ON "season_results" USING btree ("team_id","saison");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_unique_season_idx" ON "charges" USING btree ("pledge_rule_id","saison") WHERE "charges"."saison" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_unique_match_trigger_idx" ON "charges" USING btree ("pledge_rule_id","match_id","trigger_type") WHERE "charges"."match_event_id" IS NULL AND "charges"."match_id" IS NOT NULL;