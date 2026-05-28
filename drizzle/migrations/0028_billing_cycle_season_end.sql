-- Rename billing_cycle enum value 'season' to 'season_end'
-- Migration 0028 · 2026-05-28
ALTER TYPE billing_cycle RENAME VALUE 'season' TO 'season_end';
