"use server";

import { and, eq } from "drizzle-orm";
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

/**
 * Sponsor-Self-Toggle: Sponsor markiert die Rechnung als "von mir bezahlt".
 *
 * Reines UX-Marker — KickPact bleibt non-custodial und der Verein muss
 * weiterhin den Geldeingang bestätigen (`markInvoicePaid`). Diese Aktion
 * setzt nur `invoices.markedPaidBySponsorAt`.
 *
 * Toggle-Logik: ist der Marker schon gesetzt, hebt ein zweiter Klick ihn
 * wieder auf (Sponsor hat sich vertippt). Sobald aber der Verein bezahlt
 * bestätigt hat (`paidMarkedAt` gesetzt), ist der Sponsor-Marker
 * einfrierend — kein Toggle mehr möglich, würde die Vereinsbestätigung
 * verwirren.
 *
 * Auth: nur der Sponsor (sponsors.userId === session.user) der Rechnung
 * darf togglen. Verein-Admins haben hierfür `markInvoicePaid`.
 */
export async function markInvoicePaidBySponsor(invoiceId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({
      invoice: invoices,
      clubSlug: clubs.slug,
      sponsorUserId: sponsors.userId
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) throw new Error("Rechnung nicht gefunden");
  if (row.sponsorUserId !== user.id) {
    throw new Error("Diese Rechnung gehört nicht zu deinem Sponsor-Account");
  }
  if (row.invoice.paidMarkedAt) {
    throw new Error(
      "Der Verein hat den Zahlungseingang bereits bestätigt — die Markierung ist eingefroren."
    );
  }

  const next = row.invoice.markedPaidBySponsorAt ? null : new Date();

  await db
    .update(invoices)
    .set({ markedPaidBySponsorAt: next })
    .where(
      and(
        eq(invoices.id, invoiceId),
        // Defense in depth: still check sponsor scope at the WHERE level.
        eq(invoices.sponsorId, row.invoice.sponsorId)
      )
    );

  revalidatePath("/sponsor/rechnungen");
  return { markedPaidBySponsorAt: next };
}
