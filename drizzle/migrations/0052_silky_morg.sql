DROP INDEX "charges_unique_event_idx";--> statement-breakpoint
DROP INDEX "charges_unique_match_trigger_idx";--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "goal_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_unique_event_idx" ON "charges" USING btree ("pledge_rule_id","match_event_id") WHERE "charges"."match_event_id" IS NOT NULL AND "charges"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "charges_unique_match_trigger_idx" ON "charges" USING btree ("pledge_rule_id","match_id","trigger_type","goal_index") WHERE "charges"."match_event_id" IS NULL AND "charges"."match_id" IS NOT NULL AND "charges"."status" <> 'cancelled';