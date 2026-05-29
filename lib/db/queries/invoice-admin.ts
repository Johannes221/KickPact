import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, clubs, sponsors, users } from "@/lib/db/schema";

export type InvoiceStatus = "draft" | "sent" | "paid" | "withheld";

export interface AdminInvoiceRow {
  id: string;
  period: string;
  totalCents: number;
  status: InvoiceStatus;
  pdfUrl: string | null;
  sentAt: Date | null;
  paidMarkedAt: Date | null;
  markedPaidBySponsorAt: Date | null;
  cancelledAt: Date | null;
  reversalOfInvoiceId: string | null;
  createdAt: Date;
  sponsorName: string;
  sponsorEmail: string;
  clubName: string;
  clubSlug: string;
}

export async function listInvoicesForAdmin(opts?: {
  status?: InvoiceStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: AdminInvoiceRow[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const conds = [];
  if (opts?.status) conds.push(eq(invoices.status, opts.status));
  if (opts?.search && opts.search.trim().length > 0) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(ilike(clubs.name, q), ilike(sponsors.displayName, q), ilike(invoices.period, q)));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .where(where);

  const rows = await db
    .select({
      id: invoices.id,
      period: invoices.period,
      totalCents: invoices.totalCents,
      status: invoices.status,
      pdfUrl: invoices.pdfUrl,
      sentAt: invoices.sentAt,
      paidMarkedAt: invoices.paidMarkedAt,
      markedPaidBySponsorAt: invoices.markedPaidBySponsorAt,
      cancelledAt: invoices.cancelledAt,
      reversalOfInvoiceId: invoices.reversalOfInvoiceId,
      createdAt: invoices.createdAt,
      sponsorName: sponsors.displayName,
      sponsorEmail: users.email,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(where)
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset);

  return { invoices: rows, total: count };
}

/**
 * Operator markiert eine Rechnung als bezahlt/offen. paidMarkedAt ist die
 * verbindliche „bezahlt"-Quelle (vs. markedPaidBySponsorAt = nur Sponsor-Claim).
 */
export async function markInvoicePaid(input: {
  invoiceId: string;
  paid: boolean;
  operatorUserId: string;
}): Promise<void> {
  await db
    .update(invoices)
    .set({
      paidMarkedAt: input.paid ? new Date() : null,
      paidMarkedBy: input.paid ? input.operatorUserId : null,
      status: input.paid ? "paid" : "sent"
    })
    .where(eq(invoices.id, input.invoiceId));
}

export async function getInvoiceMailInfo(invoiceId: string): Promise<{
  invoiceId: string;
  period: string;
  totalCents: number;
  sponsorName: string;
  sponsorEmail: string;
  clubName: string;
} | null> {
  const [row] = await db
    .select({
      invoiceId: invoices.id,
      period: invoices.period,
      totalCents: invoices.totalCents,
      sponsorName: sponsors.displayName,
      sponsorEmail: users.email,
      clubName: clubs.name
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  return row ?? null;
}
