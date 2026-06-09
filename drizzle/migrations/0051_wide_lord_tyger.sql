CREATE TYPE "public"."team_data_coverage" AS ENUM('full', 'results_only', 'none');--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "data_coverage" "team_data_coverage";