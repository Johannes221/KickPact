DROP INDEX "sponsors_user_idx";--> statement-breakpoint
-- K1-Fix Vorstufe: sponsors.user_id wird gleich UNIQUE (genau ein Sponsor-
-- Profil pro User). Falls ein Alt-Race (zwei parallele Erst-Pact-Submits)
-- mehrere Profile pro User erzeugt hat, diese ZUERST auf das älteste Profil je
-- User zusammenführen. ALLE realen Geld-FKs auf sponsors (pledges, invoices,
-- sponsor_billing_cycle_history) VOR dem Löschen umhängen — das ON DELETE
-- CASCADE räumt sonst Beiträge/Rechnungen des Duplikats mit ab. (charges hat in
-- der realen DB KEINE sponsor_id — der Sponsor hängt dort über pledge_id →
-- pledges.sponsor_id; die Schema-Spalte ist toter Drift.) Pre-Launch praktisch
-- 0 Zeilen; defensiv gegen Datenverlust.
UPDATE "pledges" p SET "sponsor_id" = keep.id
FROM "sponsors" dup
JOIN LATERAL (
  SELECT id FROM "sponsors" k WHERE k."user_id" = dup."user_id"
  ORDER BY k."created_at" ASC, k.id ASC LIMIT 1
) keep ON true
WHERE p."sponsor_id" = dup.id AND dup.id <> keep.id;--> statement-breakpoint
UPDATE "invoices" i SET "sponsor_id" = keep.id
FROM "sponsors" dup
JOIN LATERAL (
  SELECT id FROM "sponsors" k WHERE k."user_id" = dup."user_id"
  ORDER BY k."created_at" ASC, k.id ASC LIMIT 1
) keep ON true
WHERE i."sponsor_id" = dup.id AND dup.id <> keep.id;--> statement-breakpoint
UPDATE "sponsor_billing_cycle_history" h SET "sponsor_id" = keep.id
FROM "sponsors" dup
JOIN LATERAL (
  SELECT id FROM "sponsors" k WHERE k."user_id" = dup."user_id"
  ORDER BY k."created_at" ASC, k.id ASC LIMIT 1
) keep ON true
WHERE h."sponsor_id" = dup.id AND dup.id <> keep.id;--> statement-breakpoint
DELETE FROM "sponsors" dup
USING "sponsors" k
WHERE k."user_id" = dup."user_id"
  AND ( k."created_at" < dup."created_at"
        OR (k."created_at" = dup."created_at" AND k.id < dup.id) );--> statement-breakpoint
-- M1: Bestehende 1:1-Einladungen (Inquiry-Accept) rückwirkend als single_use
-- markieren. Vor 0067 war JEDER Sponsor-Invite effektiv single-use (create-
-- pledge konsumierte unbedingt); der 0067-Default single_use=false machte sie
-- sonst rückwirkend zu Broadcast → ein an genau EINEN Sponsor gemailter Link
-- würde teilbar (Kader-Sichtbarkeit via /api/squad-Token). sponsor_inquiries.
-- invitation_id zeigt genau auf die Accept-Links; Verein-erzeugte Broadcast-
-- Links bleiben single_use=false.
UPDATE "sponsor_invitations" SET "single_use" = true
WHERE "id" IN (SELECT "invitation_id" FROM "sponsor_inquiries" WHERE "invitation_id" IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_user_idx" ON "sponsors" USING btree ("user_id");
