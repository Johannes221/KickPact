import { eq, desc, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, invoiceItems, sponsors, clubs, users } from "@/lib/db/schema";

/**
 * Rechnungen für einen Sponsor — nach Period absteigend (neueste zuerst).
 */
export async function listForSponsor(sponsorId: string) {
  return db
    .select({
      id: invoices.id,
      period: invoices.period,
      totalCents: invoices.totalCents,
      status: invoices.status,
      pdfUrl: invoices.pdfUrl,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      sentAt: invoices.sentAt,
      paidMarkedAt: invoices.paidMarkedAt,
      markedPaidBySponsorAt: invoices.markedPaidBySponsorAt,
      createdAt: invoices.createdAt
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .where(eq(invoices.sponsorId, sponsorId))
    .orderBy(desc(invoices.period), desc(invoices.createdAt));
}

/**
 * Rechnungen für einen Verein/Club — listet ALLE Sponsor-Rechnungen.
 */
export async function listForClub(clubId: string) {
  return db
    .select({
      id: invoices.id,
      period: invoices.period,
      totalCents: invoices.totalCents,
      status: invoices.status,
      pdfUrl: invoices.pdfUrl,
      sponsorId: sponsors.id,
      sponsorDisplayName: sponsors.displayName,
      sponsorType: sponsors.type,
      sponsorEmail: users.email,
      sentAt: invoices.sentAt,
      paidMarkedAt: invoices.paidMarkedAt,
      createdAt: invoices.createdAt
    })
    .from(invoices)
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(eq(invoices.clubId, clubId))
    .orderBy(desc(invoices.period), desc(invoices.createdAt));
}

/**
 * Einzelne Rechnung mit allen Items für Detail-View oder Re-Send.
 */
export async function getInvoiceWithItems(invoiceId: string) {
  const [inv] = await db
    .select({
      invoice: invoices,
      club: clubs,
      sponsor: sponsors,
      sponsorEmail: users.email
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));

  return { ...inv, items };
}

/**
 * Test ob (sponsor, club, period) schon eine Rechnung hat — verhindert Doppel-Insert.
 */
export async function invoiceExistsForPeriod(opts: {
  sponsorId: string;
  clubId: string;
  period: string;
}) {
  const [row] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.sponsorId, opts.sponsorId),
        eq(invoices.clubId, opts.clubId),
        eq(invoices.period, opts.period)
      )
    )
    .limit(1);
  return !!row;
}
