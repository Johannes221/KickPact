-- Dedupe VOR dem Unique-Index: falls schon doppelte offene Anfragen pro
-- (team, sponsor) existieren, würde CREATE UNIQUE INDEX fehlschlagen. Die
-- jeweils NEUESTE pending-Anfrage bleibt, ältere Duplikate werden abgelehnt.
UPDATE "sponsor_inquiries" si
SET "status" = 'rejected', "responded_at" = now()
WHERE si."status" = 'pending'
  AND EXISTS (
    SELECT 1 FROM "sponsor_inquiries" s2
    WHERE s2."team_id" = si."team_id"
      AND s2."sponsor_user_id" = si."sponsor_user_id"
      AND s2."status" = 'pending'
      AND (s2."created_at" > si."created_at"
           OR (s2."created_at" = si."created_at" AND s2."id" > si."id"))
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_inquiries_unique_pending_idx" ON "sponsor_inquiries" USING btree ("team_id","sponsor_user_id") WHERE "sponsor_inquiries"."status" = 'pending';