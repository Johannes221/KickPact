"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { invoices, clubs, sponsors } from "@/lib/db/schema";
import { assertClubAccess, assertClubWriteAccess } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import { getDownloadUrl } from "@/lib/invoicing/storage";

/**
 * Markiert eine Rechnung als bezahlt — kann nur ein Club-Admin der zugehörigen
 * Mannschaft. Triggert Revalidation der Vereins-Abrechnungen-Seite.
 */
export async function markInvoicePaid(invoiceId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ invoice: invoices, clubSlug: clubs.slug })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) throw new Error("Rechnung nicht gefunden");
  await assertClubWriteAccess(row.clubSlug, "admin");

  await db
    .update(invoices)
    .set({ status: "paid", paidMarkedAt: new Date(), paidMarkedBy: user.id })
    .where(eq(invoices.id, invoiceId));

  revalidatePath(`/verein/${row.clubSlug}/abrechnungen`);
}

/**
 * Generiert eine kurzlebige signierte Download-URL für eine PDF-Rechnung.
 * Zugriff: nur der Sponsor (owner) oder ein Club-Admin des zugehörigen Vereins.
 */
export async function invoiceDownloadUrl(invoiceId: string): Promise<string> {
  const user = await requireUser();
  const [row] = await db
    .select({ invoice: invoices, clubSlug: clubs.slug, sponsorUserId: sponsors.userId })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) throw new Error("Rechnung nicht gefunden");

  const isOwner = row.sponsorUserId === user.id;
  if (!isOwner) {
    // Wenn nicht Owner, dann muss User Club-Admin sein
    await assertClubAccess(row.clubSlug, "admin");
  }

  if (!row.invoice.pdfUrl) {
    throw new Error("Keine PDF-URL für diese Rechnung");
  }
  return getDownloadUrl(row.invoice.pdfUrl);
}
