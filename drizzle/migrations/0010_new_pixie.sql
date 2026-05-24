CREATE TYPE "public"."club_membership_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "club_membership_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"club_id" text NOT NULL,
	"requested_role" "member_role" NOT NULL,
	"requested_team_id" text,
	"message" text,
	"status" "club_membership_request_status" DEFAULT 'pending' NOT NULL,
	"response_message" text,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_membership_requests" ADD CONSTRAINT "club_membership_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership_requests" ADD CONSTRAINT "club_membership_requests_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership_requests" ADD CONSTRAINT "club_membership_requests_requested_team_id_teams_id_fk" FOREIGN KEY ("requested_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership_requests" ADD CONSTRAINT "club_membership_requests_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_request_unique_pending_idx" ON "club_membership_requests" USING btree ("user_id","club_id","requested_team_id") WHERE "club_membership_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "club_request_club_status_idx" ON "club_membership_requests" USING btree ("club_id","status");