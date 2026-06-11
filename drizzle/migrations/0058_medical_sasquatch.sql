CREATE TABLE "sponsor_billing_cycle_history" (
	"id" text PRIMARY KEY NOT NULL,
	"sponsor_id" text NOT NULL,
	"cycle" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_license_transfer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_club_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"effective_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "paypal_handle" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "stripe_payment_link" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "description_md" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "hero_url" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "licensed_under_club_id" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "billing_cycle" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "billing_cycle_snapshot" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsor_billing_cycle_history" ADD CONSTRAINT "sponsor_billing_cycle_history_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_license_transfer_requests" ADD CONSTRAINT "team_license_transfer_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_license_transfer_requests" ADD CONSTRAINT "team_license_transfer_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_license_transfer_requests" ADD CONSTRAINT "team_license_transfer_requests_to_club_id_clubs_id_fk" FOREIGN KEY ("to_club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_license_transfer_requests" ADD CONSTRAINT "team_license_transfer_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_license_transfer_requests" ADD CONSTRAINT "team_license_transfer_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_cycle_history_lookup_idx" ON "sponsor_billing_cycle_history" USING btree ("sponsor_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "team_license_transfer_unique_pending" ON "team_license_transfer_requests" USING btree ("team_id") WHERE "team_license_transfer_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_licensed_under_club_id_clubs_id_fk" FOREIGN KEY ("licensed_under_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teams_licensed_under_club_idx" ON "teams" USING btree ("licensed_under_club_id") WHERE "teams"."licensed_under_club_id" IS NOT NULL;