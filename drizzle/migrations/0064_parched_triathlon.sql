--> Vibe-Check B: verwaiste invoice_id-Verweise (sollten nicht existieren, da
--> invoiceId in derselben Tx wie die Rechnung gesetzt wird und Rechnungen nur
--> storniert statt gelöscht werden) VOR dem Constraint neutralisieren, damit das
--> ADD CONSTRAINT auf Prod nicht an Altdaten scheitert.
UPDATE "charges" SET "invoice_id" = NULL
WHERE "invoice_id" IS NOT NULL
  AND "invoice_id" NOT IN (SELECT "id" FROM "invoices");
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;