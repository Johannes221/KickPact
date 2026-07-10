ALTER TABLE "pledges" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "sponsor_invitations" ADD COLUMN "single_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pledges_idempotency_unique_idx" ON "pledges" USING btree ("sponsor_id","idempotency_key") WHERE "pledges"."idempotency_key" IS NOT NULL;