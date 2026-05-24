ALTER TABLE "matches" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "cancelled_reason" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "cancelled_reason" text;