-- Migration 0027: Drop deprecated pledge_proxies_json column from sponsors.
-- Eltern-Proxy-Feature ist deprecated per Spec §2026-05-26. Code bleibt als Reference.
ALTER TABLE "sponsors" DROP COLUMN IF EXISTS "pledge_proxies_json";
