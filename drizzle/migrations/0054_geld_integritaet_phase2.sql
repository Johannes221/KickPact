DROP INDEX "charges_unique_season_idx";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "past_due_since" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_unique_season_idx" ON "charges" USING btree ("pledge_rule_id","saison") WHERE "charges"."saison" IS NOT NULL AND "charges"."status" <> 'cancelled';