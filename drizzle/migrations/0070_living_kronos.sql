CREATE TABLE "club_crests" (
	"fussballde_team_id" text PRIMARY KEY NOT NULL,
	"logo_url" text NOT NULL,
	"source_url" text NOT NULL,
	"name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
