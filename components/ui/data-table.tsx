"use client";

/**
 * Generic DataTable with URL-state-pagination + sortable headers.
 *
 * Server pattern (recommended):
 *   1. Parent page parses `?page`, `?pageSize`, `?sort`, `?dir` from
 *      `searchParams` and fetches rows via `paginate(...)` + an ORDER BY
 *      that honours `sort` / `dir`.
 *   2. Parent passes the already-paginated `rows`, `page`, `pageSize`,
 *      `totalPages`, `total` plus the `columns` definition into this
 *      component.
 *   3. This client component renders the table and writes pagination/sort
 *      changes back into the URL (router.push with shallow=true). Server
 *      Component re-runs and re-fetches.
 *
 * The component owns no row-state itself — URL is the single source of truth.
 *
 * Empty + loading states are built in:
 *   - `rows.length === 0` → `emptyState` slot (or default "Keine Daten").
 *   - `isLoading` → skeleton rows (used during route transitions if the
 *     parent wraps the table in a Suspense boundary or React.useTransition).
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { ALLOWED_PAGE_SIZES } from "@/lib/db/queries/_helpers/paginate";
import type { SortDirection } from "./data-table-utils";

// Re-exported so existing `import { SortDirection } from ".../data-table"`
// keep working. The pure helper `parseSortFromSearchParams` now lives in
// data-table-utils.ts (server-safe) — see note there.
export type { SortDirection };

export interface DataTableColumn<TRow> {
  /** Unique key. Used as `sort=<key>` URL param when `sortable`. */
  key: string;
  /** Header label. */
  label: React.ReactNode;
  /** Custom cell renderer; default = `String((row as any)[key] ?? "")`. */
  render?: (row: TRow) => React.ReactNode;
  /** Whether the column header toggles `?sort=key&dir=...` in the URL. */
  sortable?: boolean;
  /** Optional Tailwind class on the `<td>`. */
  className?: string;
  /** Optional Tailwind class on the `<th>`. */
  headerClassName?: string;
  /** Right-align numeric columns. */
  align?: "left" | "right" | "center";
}

export interface DataTableProps<TRow> {
  rows: TRow[];
  columns: Array<DataTableColumn<TRow>>;
  /** Stable row key. Defaults to `(row as any).id`. */
  getRowKey?: (row: TRow, idx: number) => React.Key;
  /** Optional click handler on row. */
  onRowClick?: (row: TRow) => void;

  // --- pagination state (controlled by parent) ---
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;

  // --- sort state (controlled by parent) ---
  sort?: string;
  dir?: SortDirection;

  /** Empty state shown when `rows.length === 0` and not loading. */
  emptyState?: React.ReactNode;
  /** Render skeleton placeholders. */
  isLoading?: boolean;
  /** Number of skeleton rows when loading. Defaults to `pageSize`. */
  loadingRows?: number;

  className?: string;
}

function alignClass(align: DataTableColumn<unknown>["align"]): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

/** Build a new URLSearchParams string with the given overrides applied. */
function buildQs(
  current: URLSearchParams,
  patch: Record<string, string | number | undefined | null>
): string {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  // Page-1 + default-pageSize are implicit — strip to keep URLs clean.
  if (next.get("page") === "1") next.delete("page");
  return next.toString();
}

export function DataTable<TRow>({
  rows,
  columns,
  getRowKey,
  onRowClick,
  page,
  pageSize,
  totalPages,
  total,
  sort,
  dir,
  emptyState,
  isLoading,
  loadingRows,
  className
}: DataTableProps<TRow>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = React.useCallback(
    (patch: Record<string, string | number | undefined | null>) => {
      const qs = buildQs(searchParams, patch);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams]
  );

  function handleSortClick(col: DataTableColumn<TRow>) {
    if (!col.sortable) return;
    let nextDir: SortDirection = "asc";
    if (sort === col.key) {
      nextDir = dir === "asc" ? "desc" : "asc";
    }
    navigate({ sort: col.key, dir: nextDir, page: undefined });
  }

  function handlePageSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({ pageSize: e.target.value, page: undefined });
  }

  const showEmpty = !isLoading && rows.length === 0;

  // basePath for pagination component = current path with current search params
  // minus the `page` field (added by Pagination itself).
  const extraParams: Record<string, string | undefined> = {};
  for (const [k, v] of Array.from(searchParams.entries())) {
    if (k !== "page") extraParams[k] = v;
  }

  const rowKey = getRowKey ?? ((row: TRow, idx: number) => {
    const r = row as { id?: React.Key };
    return r.id ?? idx;
  });

  return (
    <div className={cn("space-y-3 md:space-y-4", className)}>
      <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-off-white text-[0.65rem] md:text-xs uppercase tracking-wider text-brand-night-navy/60">
            <tr>
              {columns.map((col) => {
                const isActive = sort === col.key;
                const headerCls = cn(
                  "px-3 md:px-4 py-3 font-semibold",
                  alignClass(col.align),
                  col.headerClassName
                );
                if (!col.sortable) {
                  return (
                    <th key={col.key} className={headerCls} scope="col">
                      {col.label}
                    </th>
                  );
                }
                return (
                  <th key={col.key} className={headerCls} scope="col">
                    <button
                      type="button"
                      onClick={() => handleSortClick(col)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-brand-night-navy",
                        isActive && "text-brand-night-navy"
                      )}
                      aria-sort={
                        isActive
                          ? dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <span>{col.label}</span>
                      {isActive ? (
                        dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-neutral/30">
            {isLoading
              ? Array.from({ length: loadingRows ?? pageSize }).map((_, i) => (
                  <tr key={`sk_${i}`}>
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-3 md:px-4 py-3", alignClass(col.align))}>
                        <Skeleton className="h-4 w-full max-w-[12ch]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, idx) => (
                  <tr
                    key={rowKey(row, idx)}
                    className={cn(
                      "hover:bg-brand-off-white/60",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 md:px-4 py-3 text-brand-night-navy",
                          alignClass(col.align),
                          col.className
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : String(
                              (row as Record<string, unknown>)[col.key] ?? ""
                            )}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>

        {showEmpty && (
          <div className="px-3 md:px-4 py-10 text-center text-sm text-brand-night-navy/50">
            {emptyState ?? "Keine Daten."}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-brand-night-navy/60 font-mono tabular-nums">
          {total === 0
            ? "0 Einträge"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} von ${total}`}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-brand-night-navy/60 inline-flex items-center gap-1.5">
            <span>Pro Seite</span>
            <select
              value={String(pageSize)}
              onChange={handlePageSizeChange}
              className="h-8 rounded-md border border-brand-neutral bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-neutral"
              aria-label="Einträge pro Seite"
            >
              {ALLOWED_PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath={pathname}
            extraParams={extraParams}
            className="mt-0"
          />
        </div>
      </div>
    </div>
  );
}

