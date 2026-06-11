import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import {
  listChargesForClub,
  getClubFilterOptions,
  CLUB_CHARGE_SORT_KEYS,
  type ClubChargeSortKey
} from "@/lib/db/queries/club-reporting";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { FilterBar, type FilterDefinition } from "@/components/shared/filter-bar";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { StatCard } from "@/components/shared/stat-card";
import { ChargesTable } from "./_components/charges-table";
import { eur } from "@/lib/utils/currency";

export const metadata = { title: "Beiträge · KickPact" };

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  teamId?: string;
  sponsorId?: string;
  triggerType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export default async function ChargesPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const { club, role } = await assertVereinAdminOrRedirect(slug, "viewer");
  const canEdit = role === "admin" || role === "trainer";

  const sp = await searchParams;
  const spGet = {
    get(key: string): string | null {
      const v = (sp as Record<string, string | undefined>)[key];
      return v ?? null;
    }
  };
  const { page, pageSize } = parsePaginationFromSearchParams(spGet);
  const sort = (CLUB_CHARGE_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as ClubChargeSortKey)
    : undefined;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const filter = {
    teamId: sp.teamId,
    sponsorId: sp.sponsorId,
    triggerType: sp.triggerType,
    status: sp.status,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo
  };

  // Filter-Optionen aus DB (teams + sponsors mit Pledges für diesen Club)
  const { teamRows, sponsorRows } = await getClubFilterOptions(club.id);

  const result = await listChargesForClub(club.id, {
    pagination: { page, pageSize },
    filter,
    sort,
    dir
  });

  const sumOnPageCents = result.rows.reduce((sum, r) => sum + r.amountCents, 0);

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
        { value: "pending_approval", label: "Bestätigung offen" },
        { value: "confirmed", label: "Bestätigt" },
        { value: "invoiced", label: "Abgerechnet" },
        { value: "cancelled", label: "Storniert" }
      ]
    },
    {
      key: "date",
      label: "Spiel-Datum",
      type: "dateRange"
    }
  ];

  return (
    <div className="space-y-5 md:space-y-8">
      <div>
        <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Beiträge
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Alle einzelnen Sponsor-Auslösungen quer durch alle Mannschaften.
        </p>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Beiträge (Treffer)" value={String(result.total)} />
        <StatCard
          label="Summe Seite"
          value={eur(sumOnPageCents)}
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
        rightSlot={<CsvExportButton endpoint="/api/exports/charges" slug={slug} />}
      />

      <ChargesTable
        rows={result.rows}
        slug={slug}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        sort={sort}
        dir={dir}
        canEdit={canEdit}
      />
    </div>
  );
}
