-- Team-Rollen & Nutzerverwaltung (Spec 2026-05-29) — Teil 2/3: Invite-Enum.
-- Migration 0032 · 2026-05-29
--
-- invitation_role: 'admin' additiv ergänzen (Team-Invites vergeben künftig
-- admin|viewer; Club-Invites weiterhin trainer|viewer). NUR das ADD VALUE —
-- der Wert wird erst in 0033 verwendet (Postgres-Restriktion: neue Enum-Werte
-- erst nach Commit der hinzufügenden Transaktion nutzbar).
ALTER TYPE "invitation_role" ADD VALUE IF NOT EXISTS 'admin';
