ALTER TABLE "subscriptions" ALTER COLUMN "stripe_customer_id" DROP NOT NULL;--> statement-breakpoint
-- Backfill: alte Placeholder-Werte aus finalize.ts (vor Mai 2026) auf NULL setzen,
-- damit createCheckoutSession beim ersten echten Checkout einen neuen Stripe-Customer
-- erzeugt statt mit dem Placeholder-String an Stripe weiterzureichen (führt zu 4xx).
UPDATE "subscriptions" SET "stripe_customer_id" = NULL
 WHERE "stripe_customer_id" LIKE 'placeholder_%';--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Zweistufiges NOT-NULL-Add für sponsor_invitations.expires_at:
-- 1) Spalte erst nullable hinzufügen
-- 2) Bestehende Rows backfillen (created_at + 30 Tage)
-- 3) NOT NULL nachträglich setzen
ALTER TABLE "sponsor_invitations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "sponsor_invitations"
   SET "expires_at" = "created_at" + interval '30 days'
 WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "sponsor_invitations" ALTER COLUMN "expires_at" SET NOT NULL;
