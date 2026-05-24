import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Server-Component-friendly pagination. Renders Prev / Next links plus
 * "Seite X von Y". Disabled state when at first/last page.
 *
 * `basePath` is the URL to link back to (e.g. "/verein/dossenheim"); the
 * component appends `?page=N` and preserves any extra query params via
 * `extraParams`.
 *
 * No client hooks — works in Server Components.
 */
export interface PaginationProps {
  page: number;
  totalPages: number;
  basePath: string;
  /** Extra search params to preserve when changing page (e.g. filters). */
  extraParams?: Record<string, string | undefined>;
  className?: string;
}

function buildHref(
  basePath: string,
  page: number,
  extraParams?: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== "") params.set(k, v);
    }
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  page,
  totalPages,
  basePath,
  extraParams,
  className
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  const prevHref = buildHref(basePath, Math.max(1, page - 1), extraParams);
  const nextHref = buildHref(basePath, Math.min(totalPages, page + 1), extraParams);

  const linkBase =
    "inline-flex items-center justify-center rounded-md border border-brand-neutral bg-white px-3 py-1.5 text-xs md:text-sm font-medium text-brand-night-navy hover:bg-brand-off-white transition-colors";
  const disabledCls = "pointer-events-none opacity-40";

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between gap-3 mt-3 md:mt-4 text-xs md:text-sm",
        className
      )}
    >
      <Link
        href={prevHref}
        aria-disabled={isFirst}
        tabIndex={isFirst ? -1 : 0}
        className={cn(linkBase, isFirst && disabledCls)}
      >
        ← Zurück
      </Link>
      <span className="text-brand-night-navy/60 font-mono tabular-nums">
        Seite {page} von {totalPages}
      </span>
      <Link
        href={nextHref}
        aria-disabled={isLast}
        tabIndex={isLast ? -1 : 0}
        className={cn(linkBase, isLast && disabledCls)}
      >
        Weiter →
      </Link>
    </nav>
  );
}
