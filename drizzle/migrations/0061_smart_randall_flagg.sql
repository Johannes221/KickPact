CREATE TYPE "public"."billing_provider" AS ENUM('stripe', 'apple', 'google');--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider" "billing_provider";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "apple_original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "apple_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_apple_original_transaction_id_unique" UNIQUE("apple_original_transaction_id");