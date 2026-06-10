DO $$ BEGIN
	CREATE TYPE "public"."team_data_coverage" AS ENUM('full', 'results_only', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "data_coverage" "team_data_coverage";