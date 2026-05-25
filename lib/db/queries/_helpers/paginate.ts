/**
 * Pagination helper for Drizzle SELECTs.
 *
 * Wraps any `$dynamic()` Drizzle query, applies `LIMIT` + `OFFSET`, and
 * additionally runs a `COUNT(*)` against the same source (table + where) so the
 * caller gets `{ rows, total, totalPages, page, pageSize }` in one round trip.
 *
 * Why two queries instead of `count() OVER ()`:
 *   - Keeps the row-type clean (no `_count` column leaking into all selects).
 *   - Easier to type-check via Generic without re-rewriting the field shape.
 *
 * Usage:
 * ```ts
 * import { paginate } from "@/lib/db/queries/_helpers/paginate";
 *
 * const dataQuery = db
 *   .select({ ... })
 *   .from(invoices)
 *   .where(eq(invoices.sponsorId, sponsorId))
 *   .orderBy(desc(invoices.period))
 *   .$dynamic();
 *
 * const countQuery = db
 *   .select({ count: sql<number>`count(*)::int` })
 *   .from(invoices)
 *   .where(eq(invoices.sponsorId, sponsorId))
 *   .$dynamic();
 *
 * const result = await paginate(dataQuery, countQuery, { page: 1, pageSize: 25 });
 * // result.rows: T[], result.total: number, result.totalPages: number
 * ```
 *
 * Bounds:
 *   - `page` is 1-indexed and clamped to `[1, max(1, totalPages)]`.
 *   - `pageSize` is clamped to `[1, 200]` (`MAX_PAGE_SIZE`).
 */
import { sql, type SQL } from "drizzle-orm";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;
export const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

/** Minimal shape we need from any Drizzle dynamic select. */
interface SelectLike<T> {
  limit: (n: number) => SelectLike<T>;
  offset: (n: number) => SelectLike<T>;
  then: Promise<T[]>["then"];
}

interface CountSelectLike {
  then: Promise<Array<{ count: number | string }>>["then"];
}

function clampPageSize(size: number): number {
  if (!Number.isFinite(size) || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.floor(size));
}

function clampPage(page: number): number {
  if (!Number.isFinite(page) || page < 1) return DEFAULT_PAGE;
  return Math.floor(page);
}

/**
 * Paginate a Drizzle SELECT.
 *
 * Both `dataQuery` and `countQuery` must be `$dynamic()` so we can chain
 * `.limit()` / `.offset()` on the data side. The count query must select a
 * single `count` column (an `int` cast is recommended on Postgres).
 */
export async function paginate<T>(
  dataQuery: unknown,
  countQuery: unknown,
  opts: PaginationOptions
): Promise<PaginatedResult<T>> {
  const pageSize = clampPageSize(opts.pageSize);
  const rawPage = clampPage(opts.page);

  // Issue count + first-attempt data fetch in parallel.
  const dq = dataQuery as SelectLike<T>;
  const cq = countQuery as CountSelectLike;
  const offset = (rawPage - 1) * pageSize;

  const [countRows, rows] = (await Promise.all([
    cq as unknown as Promise<Array<{ count: number | string }>>,
    dq.limit(pageSize).offset(offset) as unknown as Promise<T[]>
  ])) as [Array<{ count: number | string }>, T[]];

  const total = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // If caller asked for a page past the end, clamp to last page (rows stays
  // empty in that case — UI should redirect, but we don't refetch here).
  const page = Math.min(rawPage, totalPages);

  return { rows, total, totalPages, page, pageSize };
}

/**
 * Convenience helper: build a `count(*)::int` SELECT expression for use in
 * count queries.
 *
 * ```ts
 * const countQuery = db.select({ count: countStar() }).from(invoices)...
 * ```
 */
export function countStar(): SQL<number> {
  return sql<number>`count(*)::int`;
}

/**
 * Parse `page` + `pageSize` from a `URLSearchParams`-like object.
 * Falls back to defaults. Only allows page sizes from `ALLOWED_PAGE_SIZES`
 * to keep the option-set deterministic for UI selectors.
 */
export function parsePaginationFromSearchParams(sp: {
  get: (key: string) => string | null;
}): { page: number; pageSize: number } {
  const rawPage = Number(sp.get("page") ?? DEFAULT_PAGE);
  const rawSize = Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const pageSize = (ALLOWED_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  return { page, pageSize };
}
