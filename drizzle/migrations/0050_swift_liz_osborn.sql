ALTER TABLE "sponsors" ADD COLUMN IF NOT EXISTS "role" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN IF NOT EXISTS "description" text;
