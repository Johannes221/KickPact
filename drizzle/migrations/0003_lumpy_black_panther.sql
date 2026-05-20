CREATE TYPE "public"."inquiry_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "sponsor_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"sponsor_user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"status" "inquiry_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"response_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by" text
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "public_tagline" text;--> statement-breakpoint
ALTER TABLE "sponsor_inquiries" ADD CONSTRAINT "sponsor_inquiries_sponsor_user_id_users_id_fk" FOREIGN KEY ("sponsor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_inquiries" ADD CONSTRAINT "sponsor_inquiries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_inquiries" ADD CONSTRAINT "sponsor_inquiries_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_inquiries_team_status_idx" ON "sponsor_inquiries" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "sponsor_inquiries_sponsor_status_idx" ON "sponsor_inquiries" USING btree ("sponsor_user_id","status");--> statement-breakpoint
CREATE INDEX "teams_discoverable_idx" ON "teams" USING btree ("discoverable") WHERE "teams"."discoverable" = true;