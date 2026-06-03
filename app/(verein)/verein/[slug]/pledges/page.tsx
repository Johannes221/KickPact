import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import {
  listPledgesForClub,
  getClubFilterOptions,
  CLUB_PLEDGE_SORT_KEYS,
  type ClubPledgeSortKey
} from "@/lib/db/queries/club-reporting";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { FilterBar, type FilterDefinition } from "@/components/shared/filter-bar";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { PledgesTable } from "./_components/pledges-table";

export const metadata = { title: "Pacts · KickPact" };

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  teamId?: string;
  sponsorId?: string;
  triggerType?: string;
  status?: string;
};

export default async function PledgesPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "viewer");

  const sp = await searchParams;
  const spGet = {
    get(key: string): string | null {
      const v = (sp as Record<string, string | undefined>)[key];
      return v ?? null;
    }
  };
  const { page, pageSize } = parsePaginationFromSearchParams(spGet);
  const sort = (CLUB_PLEDGE_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as ClubPledgeSortKey)
    : undefined;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const filter = {
    teamId: sp.teamId,
    sponsorId: sp.sponsorId,
    triggerType: sp.triggerType,
    status: sp.status
  };

  const { teamRows, sponsorRows } = await getClubFilterOptions(club.id);

  const result = await listPledgesForClub(club.id, {
    pagination: { page, pageSize },
    filter,
    sort,
    dir
  });

  const totalMonthlyCommitmentCents = result.rows.reduce(
    (sum, r) => sum + (r.amountCents ?? 0),
    0
  );

  const filterDefs: FilterDefinition[] = [
    {
      key: "teamId",
      label: "Mannschaft",
      type: "select",
      placeholder: "Alle Mannschaften",
      options: teamRows.map((t) => ({ value: t.id, label: t.name }))
    },
    {
      key: "sponsorId",
      label: "Sponsor",
      type: "select",
      placeholder: "Alle Sponsoren",
      options: sponsorRows.map((s) => ({ value: s.id, label: s.displayName }))
    },
    {
      key: "triggerType",
      label: "Trigger",
      type: "select",
      placeholder: "Alle Trigger",
      options: Object.entries(TRIGGER_META).map(([k, meta]) => ({
        value: k,
        label: meta.label
      }))
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Aktiv" },
        { value: "paused", label: "Pausiert" },
        { value: "ended", label: "Beendet" }
      ]
    }
  ];

  return (
    <div className="space-y-5 md:space-y-8">
      <div>
        <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Pacts
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Alle Sponsor-Wetten (pro Pact-Regel) im Verein. Filter, Sortierung
          und CSV-Export.
        </p>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Pact-Regeln" value={String(result.total)} />
        <StatCard
          label="€ / Event (Seite)"
          value={eur(totalMonthlyCommitmentCents)}
          hint={`Seite ${result.page}/${result.totalPages}`}
        />
        <StatCard
          label="Filter aktiv"
          value={String(
            Object.values(filter).filter((v) => v !== undefined && v !== "").length
          )}
        />
      </div>

      <FilterBar
        filters={filterDefs}
        rightSlot={<CsvExportButton endpoint="/api/exports/pledges" slug={slug} />}
      />

      <PledgesTable
        rows={result.rows}
        slug={slug}
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

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-brand-neutral/40 bg-white p-4">
      <div className="text-[0.65rem] md:text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1.5 font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
        {value}
      </div>
      {hint && <div className="text-xs text-brand-night-navy/40 mt-0.5">{hint}</div>}
    </div>
  );
}
