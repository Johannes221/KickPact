-- HINWEIS: db:generate emittierte hier zusätzlich ADD VALUE 'home_win'/'away_win'
-- für trigger_type. Die wurden bereits von 0059_home_away_win angewandt — das
-- 0059-Snapshot war nur nicht aktualisiert, daher der Doppel-Diff. Bewusst
-- ENTFERNT (sonst „enum value already exists" + ADD VALUE läuft nicht in der
-- Migrations-Transaktion). Das korrekte 0060-Snapshot enthält die Werte → die
-- Snapshot-Kette ist ab hier wieder synchron.
CREATE TABLE "team_standings" (
	"team_id" text NOT NULL,
	"saison" text NOT NULL,
	"data" jsonb NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_standings_team_id_saison_pk" PRIMARY KEY("team_id","saison")
);
