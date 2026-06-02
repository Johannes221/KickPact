CREATE TABLE "consumed_trials" (
	"key" text PRIMARY KEY NOT NULL,
	"club_id" text,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pledge_rules" ADD COLUMN "effective_from" timestamp with time zone DEFAULT '1970-01-01T00:00:00Z' NOT NULL;--> statement-breakpoint
ALTER TABLE "pledge_rules" ADD COLUMN "effective_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "cancelled_by_user_id" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "cancelled_at" timestamp with time zone;