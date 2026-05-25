import {
  listVereineForAdmin,
  ADMIN_VEREIN_SORT_KEYS,
  type AdminVereinSortKey
} from "@/lib/db/queries/platform-stats";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import { parseSortFromSearchParams } from "@/components/ui/data-table";
import { VereineTable } from "./_components/vereine-table";
import { VereineFilters } from "./_components/vereine-filters";

export const metadata = { title: "Vereine · Admin · KickPact" };
export const dynamic = "force-dynamic";

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  status?: string;
  plan?: string;
  verified?: string;
  q?: string;
};

export default async function VereinePage({
  searchParams
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const spGet = {
    get(key: string): string | null {
      const v = (sp as Record<string, string | undefined>)[key];
      return v ?? null;
    }
  };
  const { page, pageSize } = parsePaginationFromSearchParams(spGet);
  const { sort, dir } = parseSortFromSearchParams<AdminVereinSortKey>(
    spGet,
    ADMIN_VEREIN_SORT_KEYS
  );
  const verifiedFilter =
    sp.verified === "yes" || sp.verified === "no" ? sp.verified : undefined;

  const result = await listVereineForAdmin({
    pagination: { page, pageSize },
    sort,
    dir,
    filter: {
      status: sp.status || undefined,
      plan: sp.plan || undefined,
      verified: verifiedFilter,
      search: sp.q || undefined
    }
  });

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-brand-night-navy/60">
          {result.total === 0
            ? "Keine Vereine gefunden."
            : `${result.total} Verein${result.total === 1 ? "" : "e"}`}
        </p>
      </div>
      <VereineFilters />
      <VereineTable
        rows={result.rows}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        sort={sort}
        dir={dir}
      />
    </div>
  );
}
