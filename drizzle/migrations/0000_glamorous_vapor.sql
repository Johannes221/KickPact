CREATE TYPE "public"."member_role" AS ENUM('admin', 'trainer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sponsor_type" AS ENUM('familie', 'business');--> statement-breakpoint
CREATE TYPE "public"."pledge_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('goal_total', 'goal_by_player', 'win', 'loss', 'draw', 'clean_sheet', 'comeback_win', 'hattrick', 'goal_diff_min', 'goals_scored_min', 'special_goal', 'yellow_card', 'red_card', 'assist', 'man_of_match', 'custom');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'confirmed', 'disputed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."event_side" AS ENUM('heim', 'gast');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('scraped', 'manual');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('tor', 'auswechslung', 'spezial', 'karte');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'finished', 'cancelled', 'postponed');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending_approval', 'confirmed', 'invoiced', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('basic', 'pro');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled', 'incomplete');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_memberships" (
	"user_id" text NOT NULL,
	"club_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_memberships_user_id_club_id_pk" PRIMARY KEY("user_id","club_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"ort" text,
	"fussballde_verein_id" text,
	"tax_id" text,
	"is_small_business" boolean DEFAULT false NOT NULL,
	"address_json" jsonb,
	"iban" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "clubs_fussballde_verein_id_unique" UNIQUE("fussballde_verein_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"fussballde_player_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"name" text NOT NULL,
	"saison" text NOT NULL,
	"fussballde_team_id" text,
	"fussballde_slug" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"type" "sponsor_type" NOT NULL,
	"business_name" text,
	"business_address_json" jsonb,
	"business_tax_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pledge_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"pledge_id" text NOT NULL,
	"trigger_type" "trigger_type" NOT NULL,
	"trigger_params_json" jsonb DEFAULT '{}'::jsonb,
	"amount_cents" integer NOT NULL,
	"per_match_cap_cents" integer,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pledges" (
	"id" text PRIMARY KEY NOT NULL,
	"sponsor_id" text NOT NULL,
	"team_id" text NOT NULL,
	"status" "pledge_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"monthly_cap_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"match_event_id" text NOT NULL,
	"pledge_rule_id" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"dispute_reason" text,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_events" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"minute" integer,
	"type" "event_type" NOT NULL,
	"subtype" text,
	"side" "event_side" NOT NULL,
	"player_name" text,
	"player_id" text,
	"source" "event_source" NOT NULL,
	"reported_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"fussballde_spiel_id" text NOT NULL,
	"datum" timestamp with time zone NOT NULL,
	"heim_name" text NOT NULL,
	"gast_name" text NOT NULL,
	"ergebnis_heim" integer,
	"ergebnis_gast" integer,
	"halbzeit_heim" integer,
	"halbzeit_gast" integer,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"crawled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_fussballde_spiel_id_unique" UNIQUE("fussballde_spiel_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charges" (
	"id" text PRIMARY KEY NOT NULL,
	"pledge_id" text NOT NULL,
	"pledge_rule_id" text NOT NULL,
	"match_id" text NOT NULL,
	"match_event_id" text,
	"trigger_type" "trigger_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" charge_status DEFAULT 'confirmed' NOT NULL,
	"invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"charge_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"sponsor_id" text NOT NULL,
	"club_id" text NOT NULL,
	"period" text NOT NULL,
	"total_cents" integer NOT NULL,
	"pdf_url" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_marked_at" timestamp with time zone,
	"paid_marked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"club_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_club_id" text NOT NULL,
	"team_id" text NOT NULL,
	"plan" "plan" DEFAULT 'basic' NOT NULL,
	"stripe_subscription_item_id" text,
	"status" "license_status" DEFAULT 'trialing' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "team_licenses_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pledge_rules" ADD CONSTRAINT "pledge_rules_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pledges" ADD CONSTRAINT "pledges_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pledges" ADD CONSTRAINT "pledges_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_approvals" ADD CONSTRAINT "event_approvals_match_event_id_match_events_id_fk" FOREIGN KEY ("match_event_id") REFERENCES "public"."match_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_approvals" ADD CONSTRAINT "event_approvals_pledge_rule_id_pledge_rules_id_fk" FOREIGN KEY ("pledge_rule_id") REFERENCES "public"."pledge_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_events" ADD CONSTRAINT "match_events_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "charges" ADD CONSTRAINT "charges_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "charges" ADD CONSTRAINT "charges_pledge_rule_id_pledge_rules_id_fk" FOREIGN KEY ("pledge_rule_id") REFERENCES "public"."pledge_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "charges" ADD CONSTRAINT "charges_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "charges" ADD CONSTRAINT "charges_match_event_id_match_events_id_fk" FOREIGN KEY ("match_event_id") REFERENCES "public"."match_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_licenses" ADD CONSTRAINT "team_licenses_subscription_club_id_subscriptions_club_id_fk" FOREIGN KEY ("subscription_club_id") REFERENCES "public"."subscriptions"("club_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_licenses" ADD CONSTRAINT "team_licenses_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clubs_slug_idx" ON "clubs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "players_team_fussballde_idx" ON "players" USING btree ("team_id","fussballde_player_id") WHERE "players"."fussballde_player_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_club_saison_idx" ON "teams" USING btree ("club_id","saison");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_fussballde_idx" ON "teams" USING btree ("fussballde_team_id","saison") WHERE "teams"."fussballde_team_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsors_user_idx" ON "sponsors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pledge_rules_pledge_idx" ON "pledge_rules" USING btree ("pledge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pledges_sponsor_idx" ON "pledges" USING btree ("sponsor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pledges_team_idx" ON "pledges" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_approvals_pending_idx" ON "event_approvals" USING btree ("pledge_rule_id","status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_events_match_idx" ON "match_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_events_match_type_idx" ON "match_events" USING btree ("match_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_team_datum_idx" ON "matches" USING btree ("team_id","datum");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charges_pledge_status_idx" ON "charges" USING btree ("pledge_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "charges_unique_event_idx" ON "charges" USING btree ("pledge_rule_id","match_event_id") WHERE "charges"."match_event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "charges_unique_match_trigger_idx" ON "charges" USING btree ("pledge_rule_id","match_id","trigger_type") WHERE "charges"."match_event_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_sponsor_club_period_idx" ON "invoices" USING btree ("sponsor_id","club_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_licenses_status_idx" ON "team_licenses" USING btree ("status");