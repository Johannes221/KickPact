import {
  listUsersForAdmin,
  ADMIN_USER_SORT_KEYS,
  type AdminUserSortKey
} from "@/lib/db/queries/platform-stats";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import { parseSortFromSearchParams } from "@/components/ui/data-table";
import { UsersTable } from "./_components/users-table";
import { UsersFilters } from "./_components/users-filters";

export const metadata = { title: "User · Admin · KickPact" };
export const dynamic = "force-dynamic";

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  q?: string;
  sponsor?: string;
  club?: string;
  pledges?: string;
};

export default async function UsersPage({
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
  const { sort, dir } = parseSortFromSearchParams<AdminUserSortKey>(
    spGet,
    ADMIN_USER_SORT_KEYS
  );

  const result = await listUsersForAdmin({
    pagination: { page, pageSize },
    sort,
    dir,
    filter: {
      search: sp.q || undefined,
      hasSponsor: sp.sponsor === "1",
      hasClubMembership: sp.club === "1",
      hasPledges: sp.pledges === "1"
    }
  });

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-brand-night-navy/60">
          {result.total === 0
            ? "Keine User gefunden."
            : `${result.total} User`}
        </p>
      </div>
      <UsersFilters />
      <UsersTable
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
