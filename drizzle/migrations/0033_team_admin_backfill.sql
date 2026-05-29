-- Team-Rollen & Nutzerverwaltung (Spec 2026-05-29) — Teil 3/3: Backfill.
-- Migration 0033 · 2026-05-29
--
-- Backfill: jede AUTARKE Mannschaft (eigene Lizenz, NICHT unter Vereinslizenz,
-- oder ganz ohne Lizenz) bekommt ihre Club-Admin(s) als direkten
-- teamMemberships-Admin. Verhindert, dass das Lizenz-Gating in
-- resolveTeamAccess den Owner einer autarken Mannschaft aussperrt.
-- Vereinsgeführte Teams brauchen keinen Backfill — der Durchgriff bleibt.
--
-- Nutzt team_member_role 'admin' aus dem RENAME in 0031 (RENAME-Werte sind
-- sofort nutzbar). Bewusst KEIN UPDATE auf invitation_role 'admin': der
-- orm-Test-Migrator fährt alle Migrationen in EINER Transaktion, in der ein
-- frisch per ADD VALUE ergänzter Enum-Wert noch nicht nutzbar ist. Legacy-
-- Team-Invites mit role='trainer' werden stattdessen zur Laufzeit in
-- acceptTeamMemberInvitation auf 'admin' koerziert.
--
-- Der plan-Vergleich nutzt `::text` (kein Enum-Literal): 'verein' wurde per
-- ADD VALUE (Migration 0012) ergänzt und wäre als Enum-Wert in derselben
-- From-Scratch-Transaktion nicht nutzbar. Als Text-Vergleich umgangen.
INSERT INTO "team_memberships" ("user_id", "team_id", "role")
SELECT cm."user_id", t."id", 'admin'
FROM "teams" t
JOIN "club_memberships" cm
  ON cm."club_id" = t."club_id" AND cm."role" = 'admin'
LEFT JOIN "team_licenses" tl ON tl."team_id" = t."id"
WHERE tl."id" IS NULL
   OR (tl."plan"::text <> 'verein' AND tl."parent_club_license_id" IS NULL)
ON CONFLICT ("user_id", "team_id") DO NOTHING;
