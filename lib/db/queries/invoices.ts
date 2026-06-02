import { eq, desc, asc, and, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, invoiceItems, sponsors, clubs, users } from "@/lib/db/schema";
import {
  countStar,
  paginate,
  type PaginatedResult
} from "@/lib/db/queries/_helpers/paginate";
import { sponsorLabelSql } from "./sponsor-label";

/**
 * Sortable column keys for sponsor invoice listings. Used both by
 * `listForSponsor` and by the DataTable in `/sponsor/rechnungen`.
 */
export const SPONSOR_INVOICE_SORT_KEYS = ["period", "totalCents", "status"] as const;
export type SponsorInvoiceSortKey = (typeof SPONSOR_INVOICE_SORT_KEYS)[number];

/**
 * Sortable column keys for club-side invoice listings.
 */
export const CLUB_INVOICE_SORT_KEYS = [
  "period",
  "totalCents",
  "status",
  "sponsorDisplayName"
] as const;
export type ClubInvoiceSortKey = (typeof CLUB_INVOICE_SORT_KEYS)[number];

type SortDir = "asc" | "desc";

/**
 * Rechnungen für einen Sponsor — default sortiert nach Period absteigend.
 *
 * Overload-Verhalten:
 *   - Ohne `opts`: liefert ALLE Rows als Array (Rückwärts-Kompat).
 *   - Mit `opts.pagination`: liefert `PaginatedResult` mit page/total/totalPages.
 */
export function listForSponsor(sponsorId: string): Promise<SponsorInvoiceRow[]>;
export function listForSponsor(
  sponsorId: string,
  opts: {
    pagination: { page: number; pageSize: number };
    sort?: SponsorInvoiceSortKey;
    dir?: SortDir;
  }
): Promise<PaginatedResult<SponsorInvoiceRow>>;
export async function listForSponsor(
  sponsorId: string,
  opts?: {
    pagination: { page: number; pageSize: number };
    sort?: SponsorInvoiceSortKey;
    dir?: SortDir;
  }
): Promise<SponsorInvoiceRow[] | PaginatedResult<SponsorInvoiceRow>> {
  const baseSelect = {
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
  };
  const where = eq(invoices.sponsorId, sponsorId);

  if (!opts) {
    return db
      .select(baseSelect)
      .from(invoices)
      .innerJoin(clubs, eq(invoices.clubId, clubs.id))
      .where(where)
      .orderBy(desc(invoices.period), desc(invoices.createdAt));
  }

  const order = sponsorInvoiceOrder(opts.sort, opts.dir);
  const dataQuery = db
    .select(baseSelect)
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .where(where)
    .orderBy(...order)
    .$dynamic();
  const countQuery = db
    .select({ count: countStar() })
    .from(invoices)
    .where(where)
    .$dynamic();

  return paginate<SponsorInvoiceRow>(dataQuery, countQuery, opts.pagination);
}

export type SponsorInvoiceRow = {
  id: string;
  period: string;
  totalCents: number;
  status: string;
  pdfUrl: string | null;
  clubName: string;
  clubSlug: string;
  sentAt: Date | null;
  paidMarkedAt: Date | null;
  markedPaidBySponsorAt: Date | null;
  createdAt: Date;
};

function sponsorInvoiceOrder(sort?: SponsorInvoiceSortKey, dir?: SortDir): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "totalCents":
      return [d(invoices.totalCents), desc(invoices.createdAt)];
    case "status":
      return [d(invoices.status), desc(invoices.period)];
    case "period":
      return [d(invoices.period), desc(invoices.createdAt)];
    default:
      return [desc(invoices.period), desc(invoices.createdAt)];
  }
}

/**
 * Rechnungen für einen Verein/Club — listet ALLE Sponsor-Rechnungen.
 *
 * Overload wie `listForSponsor`: ohne `opts` = alle Rows, mit `opts` paginiert.
 */
export function listForClub(clubId: string): Promise<ClubInvoiceRow[]>;
export function listForClub(
  clubId: string,
  opts: {
    pagination: { page: number; pageSize: number };
    sort?: ClubInvoiceSortKey;
    dir?: SortDir;
  }
): Promise<PaginatedResult<ClubInvoiceRow>>;
export async function listForClub(
  clubId: string,
  opts?: {
    pagination: { page: number; pageSize: number };
    sort?: ClubInvoiceSortKey;
    dir?: SortDir;
  }
): Promise<ClubInvoiceRow[] | PaginatedResult<ClubInvoiceRow>> {
  const baseSelect = {
    id: invoices.id,
    period: invoices.period,
    totalCents: invoices.totalCents,
    status: invoices.status,
    pdfUrl: invoices.pdfUrl,
    sponsorId: sponsors.id,
    sponsorDisplayName: sponsorLabelSql,
    sponsorType: sponsors.type,
    sponsorEmail: users.email,
    sentAt: invoices.sentAt,
    paidMarkedAt: invoices.paidMarkedAt,
    createdAt: invoices.createdAt
  };
  const where = eq(invoices.clubId, clubId);

  if (!opts) {
    return db
      .select(baseSelect)
      .from(invoices)
      .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
      .innerJoin(users, eq(sponsors.userId, users.id))
      .where(where)
      .orderBy(desc(invoices.period), desc(invoices.createdAt));
  }

  const order = clubInvoiceOrder(opts.sort, opts.dir);
  const dataQuery = db
    .select(baseSelect)
    .from(invoices)
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(where)
    .orderBy(...order)
    .$dynamic();
  const countQuery = db
    .select({ count: countStar() })
    .from(invoices)
    .where(where)
    .$dynamic();

  return paginate<ClubInvoiceRow>(dataQuery, countQuery, opts.pagination);
}

export type ClubInvoiceRow = {
  id: string;
  period: string;
  totalCents: number;
  status: string;
  pdfUrl: string | null;
  sponsorId: string;
  sponsorDisplayName: string;
  sponsorType: string;
  sponsorEmail: string;
  sentAt: Date | null;
  paidMarkedAt: Date | null;
  createdAt: Date;
};

function clubInvoiceOrder(sort?: ClubInvoiceSortKey, dir?: SortDir): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "totalCents":
      return [d(invoices.totalCents), desc(invoices.createdAt)];
    case "status":
      return [d(invoices.status), desc(invoices.period)];
    case "sponsorDisplayName":
      return [d(sponsors.displayName), desc(invoices.period)];
    case "period":
      return [d(invoices.period), desc(invoices.createdAt)];
    default:
      return [desc(invoices.period), desc(invoices.createdAt)];
  }
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

/**
 * Findet eine Rechnung anhand ihrer Storage-URL (`local://<key>`) und liefert
 * die für den Auth-Check nötigen Felder mit — Owner-Sponsor + Club-Slug.
 * Für den lokalen PDF-Serve-Endpoint (/api/invoices/pdf).
 */
export async function findInvoiceByPdfUrl(pdfUrl: string) {
  const [row] = await db
    .select({
      invoice: invoices,
      clubSlug: clubs.slug,
      sponsorUserId: sponsors.userId
    })
    .from(invoices)
    .innerJoin(clubs, eq(invoices.clubId, clubs.id))
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .where(eq(invoices.pdfUrl, pdfUrl))
    .limit(1);
  return row;
}
