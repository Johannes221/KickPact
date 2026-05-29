import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsors, pledges, teams, clubs, charges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { triggerLabel } from "@/lib/triggers/labels";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import { parseSortFromSearchParams } from "@/components/ui/data-table-utils";
import {
  listChargesForSponsor,
  SPONSOR_CHARGE_SORT_KEYS,
  type SponsorChargeSortKey
} from "@/lib/db/queries/sponsor-reporting";
import { FilterBar, type FilterDefinition } from "@/components/shared/filter-bar";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { SponsorChargesTable } from "./_components/sponsor-charges-table";

export const metadata = { title: "Charges · KickPact" };

type SP = Record<string, string | undefined>;

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Bestätigt" },
  { value: "invoiced", label: "Berechnet" },
  { value: "pending_approval", label: "Wartet" },
  { value: "cancelled", label: "Storniert" }
];

const VALID_STATUS = new Set([
  "confirmed",
  "invoiced",
  "pending_approval",
  "cancelled"
]);

function parseDateOrUndefined(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function spGetter(sp: SP): { get: (k: string) => string | null } {
  return { get: (k: string) => sp[k] ?? null };
}

export default async function ChargesPage({
  searchParams
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireUser();
  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  if (!sponsor) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 md:mb-10">
          <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
            Charges
          </h1>
        </div>
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <p className="text-sm md:text-base text-brand-night-navy/70">
            Du brauchst zuerst ein Sponsor-Profil bevor hier Charges erscheinen.
          </p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const get = spGetter(sp);

  // Filter parsen
  const clubFilter = sp.clubId ?? "";
  const teamFilter = sp.teamId ?? "";
  const triggerFilter = sp.triggerType ?? "";
  const statusFilter = sp.status ?? "";

  const dateFrom = parseDateOrUndefined(sp.dateFrom);
  const dateToRaw = parseDateOrUndefined(sp.dateTo);
  // dateTo soll inklusiv sein → +1 Tag
  const dateTo = dateToRaw
    ? new Date(dateToRaw.getTime() + 24 * 60 * 60 * 1000)
    : undefined;

  const { page, pageSize } = parsePaginationFromSearchParams(get);
  const { sort, dir } = parseSortFromSearchParams<SponsorChargeSortKey>(
    get,
    SPONSOR_CHARGE_SORT_KEYS
  );

  // Distinkte Clubs, Teams, Trigger für die Filter-Optionen (nur jene, in
  // denen dieser Sponsor schon Charges hatte — sonst leerer Dropdown).
  const [clubOpts, teamOpts, triggerOpts] = await Promise.all([
    db
      .selectDistinct({
        id: clubs.id,
        name: clubs.name
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(pledges.sponsorId, sponsor.id))
      .orderBy(clubs.name),
    db
      .selectDistinct({
        id: teams.id,
        name: teams.name,
        clubName: clubs.name
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(pledges.sponsorId, sponsor.id))
      .orderBy(teams.name),
    db
      .select({ triggerType: charges.triggerType })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(eq(pledges.sponsorId, sponsor.id))
      .groupBy(charges.triggerType)
      .orderBy(sql`MIN(${charges.triggerType})`)
  ]);

  const filterDefs: FilterDefinition[] = [
    {
      key: "clubId",
      label: "Verein",
      type: "select",
      options: clubOpts.map((c) => ({ value: c.id, label: c.name }))
    },
    {
      key: "teamId",
      label: "Mannschaft",
      type: "select",
      options: teamOpts.map((t) => ({
        value: t.id,
        label: `${t.name} (${t.clubName})`
      }))
    },
    {
      key: "triggerType",
      label: "Trigger",
      type: "select",
      options: triggerOpts.map((t) => ({
        value: t.triggerType,
        label: triggerLabel(t.triggerType)
      }))
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: STATUS_OPTIONS
    },
    {
      key: "date",
      label: "Datum",
      type: "dateRange"
    }
  ];

  const result = await listChargesForSponsor(sponsor.id, {
    pagination: { page, pageSize },
    sort,
    dir,
    filters: {
      clubIds: clubFilter ? [clubFilter] : undefined,
      teamIds: teamFilter ? [teamFilter] : undefined,
      triggerTypes: triggerFilter ? [triggerFilter as never] : undefined,
      statuses:
        statusFilter && VALID_STATUS.has(statusFilter)
          ? [statusFilter as never]
          : undefined,
      from: dateFrom,
      to: dateTo
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          Charges
        </h1>
        <p className="mt-1.5 text-sm md:text-base text-brand-night-navy/60">
          Jeder einzelne Trigger, der für dich ausgelöst wurde — über alle
          Vereine und Mannschaften hinweg.
        </p>
      </div>

      <FilterBar
        filters={filterDefs}
        rightSlot={
          <CsvExportButton
            endpoint="/api/exports/sponsor-charges"
            slug="me"
            label="CSV-Export"
          />
        }
      />

      <SponsorChargesTable
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
