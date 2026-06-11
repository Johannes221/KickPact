-- Phase 3 / R4: seasons-Stammdaten als Migration statt manuellem Seed-Script.
-- Werte 2627/2728 exakt aus lib/db/seeds/seasons.ts; 2526 zusätzlich, damit
-- computeTrialEndsAt + getActiveSeasonForDate auch für die laufende Saison
-- eine Row finden. Idempotent via ON CONFLICT(code) DO NOTHING — der
-- Drizzle-Migrator führt das in einer Transaktion aus, reines INSERT ist safe.
INSERT INTO "seasons" ("id", "code", "region", "starts_at", "ends_at", "matchday_5_at")
VALUES
  ('season_seed_2526', '2526', 'DFB', '2025-08-01T00:00:00Z', '2026-06-30T23:59:59Z', '2025-09-15T23:59:59Z'),
  ('season_seed_2627', '2627', 'DFB', '2026-08-01T00:00:00Z', '2027-05-31T23:59:59Z', '2026-09-15T23:59:59Z'),
  ('season_seed_2728', '2728', 'DFB', '2027-08-01T00:00:00Z', '2028-05-31T23:59:59Z', '2027-09-15T23:59:59Z')
ON CONFLICT ("code") DO NOTHING;
