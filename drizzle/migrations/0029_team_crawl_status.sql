-- Team-Crawl-Status für die „Spiele werden geladen"-UX
-- Migration 0029 · 2026-05-29
--
-- Zwei additive nullable Timestamps auf teams. crawlStartedAt wird gesetzt,
-- sobald ein Crawl angestoßen wird (Onboarding-Insert + Anfang jeder Crawler-
-- Iteration), crawlCompletedAt wenn der Crawl durchgelaufen ist. Das Team-
-- Dashboard zeigt das Lade-Banner solange ein Crawl läuft (siehe
-- lib/crawler/crawl-status.ts mit 10-Min-Stale-Guard).
--
-- Backfill: bestehende Teams bleiben NULL → gelten als „nicht crawling".

ALTER TABLE "teams" ADD COLUMN "crawl_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "crawl_completed_at" timestamp with time zone;
