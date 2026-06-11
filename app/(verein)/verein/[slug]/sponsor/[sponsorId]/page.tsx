import { notFound } from "next/navigation";
import Link from "next/link";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { parsePaginationFromSearchParams } from "@/lib/db/queries/_helpers/paginate";
import {
  getSponsorOverviewForClub,
  listChargesForClub,
  listPledgesForClub,
  CLUB_CHARGE_SORT_KEYS,
  type ClubChargeSortKey
} from "@/lib/db/queries/club-reporting";
import { triggerEmoji, triggerLabel } from "@/lib/triggers/labels";
import { CsvExportButton } from "@/components/shared/csv-export-button";
import { SponsorChargesTable } from "./_components/sponsor-charges-table";

export const metadata = { title: "Sponsor · KickPact" };

type SP = {
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
};

export default async function SponsorDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; sponsorId: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug, sponsorId } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "viewer");

  const overview = await getSponsorOverviewForClub(club.id, sponsorId);
  if (!overview) notFound();

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

  const [chargesResult, pledgeRows] = await Promise.all([
    listChargesForClub(club.id, {
      pagination: { page, pageSize },
      filter: { sponsorId },
      sort,
      dir
    }),
    listPledgesForClub(club.id, { filter: { sponsorId } })
  ]);

  return (
    <div className="space-y-6 md:space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Link
          href={`/verein/${slug}/sponsoren`}
          className="text-xs text-brand-night-navy/60 hover:underline w-fit"
        >
          ‹ Zurück zu Sponsoren
        </Link>
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
              {overview.sponsor.displayName}
            </h2>
            <p className="mt-1 text-sm text-brand-night-navy/60">
              {overview.sponsor.email} ·{" "}
              <span className="capitalize">{overview.sponsor.type}</span>
              {overview.sponsor.businessName && ` · ${overview.sponsor.businessName}`}
            </p>
          </div>
        </div>
      </div>

      {/* KPI-Tiles */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
        <Tile
          label="Total YTD"
          value={eur(overview.totals.totalChargesYtdCents)}
          hint={`${new Date().getFullYear()}`}
        />
        <Tile
          label="Aktive Pacts"
          value={String(overview.totals.activePledges)}
        />
        <Tile
          label="Total Lifetime"
          value={eur(overview.totals.totalChargesLifetimeCents)}
          hint="Alle Beiträge"
        />
      </div>

      {/* Teams */}
      <section>
        <h3 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
          Bei diesen Teams
        </h3>
        {overview.teams.length === 0 ? (
          <p className="text-sm text-brand-night-navy/60">
            Dieser Sponsor hat aktuell keine Pacts in diesem Verein.
          </p>
        ) : (
          <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {overview.teams.map((t) => (
              <li
                key={t.teamId}
                className="rounded-xl bg-white shadow-ios-card p-3"
              >
                <Link
                  href={`/verein/${slug}/mannschaft/${t.teamId}`}
                  className="block hover:underline"
                >
                  <div className="font-semibold text-brand-night-navy">{t.teamName}</div>
                  <div className="text-xs text-brand-night-navy/50 mt-0.5">
                    {t.saison} · {t.pledgeCount}{" "}
                    {t.pledgeCount === 1 ? "Pact" : "Pacts"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Trigger-Breakdown */}
      {overview.triggerBreakdown.length > 0 && (
        <section>
          <h3 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
            Aufschlüsselung nach Trigger
          </h3>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-ios-card">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-[0.65rem] md:text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th scope="col" className="px-3 md:px-4 py-3 text-left font-semibold">
                    Trigger
                  </th>
                  <th scope="col" className="px-3 md:px-4 py-3 text-right font-semibold">
                    Anzahl
                  </th>
                  <th scope="col" className="px-3 md:px-4 py-3 text-right font-semibold">
                    Summe
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {overview.triggerBreakdown.map((b) => (
                  <tr key={b.triggerType}>
                    <td className="px-3 md:px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden>{triggerEmoji(b.triggerType)}</span>
                        <span>{triggerLabel(b.triggerType)}</span>
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-3 text-right font-mono tabular-nums">
                      {b.countCharges}
                    </td>
                    <td className="px-3 md:px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {eur(b.sumCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pledges */}
      <section>
        <h3 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
          Pacts ({pledgeRows.length})
        </h3>
        {pledgeRows.length === 0 ? (
          <p className="text-sm text-brand-night-navy/60">Keine Pacts.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-ios-card">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-[0.65rem] md:text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th scope="col" className="px-3 md:px-4 py-3 text-left font-semibold">
                    Team
                  </th>
                  <th scope="col" className="px-3 md:px-4 py-3 text-left font-semibold">
                    Trigger
                  </th>
                  <th scope="col" className="px-3 md:px-4 py-3 text-right font-semibold">
                    € / Event
                  </th>
                  <th scope="col" className="px-3 md:px-4 py-3 text-right font-semibold">
                    Monats-Cap
                  </th>
                  <th scope="col" className="px-3 md:px-4 py-3 text-left font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {pledgeRows.map((r) => (
                  <tr key={r.ruleId}>
                    <td className="px-3 md:px-4 py-3">
                      <Link
                        href={`/verein/${slug}/mannschaft/${r.teamId}`}
                        className="hover:underline"
                      >
                        {r.teamName}
                      </Link>
                    </td>
                    <td className="px-3 md:px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden>{triggerEmoji(r.triggerType)}</span>
                        <span>{triggerLabel(r.triggerType)}</span>
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-3 text-right font-mono tabular-nums">
                      {eur(r.amountCents)}
                    </td>
                    <td className="px-3 md:px-4 py-3 text-right font-mono tabular-nums text-brand-night-navy/70">
                      {r.monthlyCapCents ? eur(r.monthlyCapCents) : "—"}
                    </td>
                    <td className="px-3 md:px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] md:text-xs font-semibold " +
                          (r.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.status === "paused"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-neutral-100 text-neutral-500")
                        }
                      >
                        {r.status === "active"
                          ? "Aktiv"
                          : r.status === "paused"
                            ? "Pausiert"
                            : "Beendet"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Charges */}
      <section>
        <div className="flex items-end justify-between mb-3 md:mb-4">
          <h3 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy">
            Beiträge ({chargesResult.total})
          </h3>
          <CsvExportButton
            endpoint="/api/exports/charges"
            slug={slug}
            extraParams={{ sponsorId }}
          />
        </div>
        <SponsorChargesTable
          rows={chargesResult.rows}
          slug={slug}
          page={chargesResult.page}
          pageSize={chargesResult.pageSize}
          total={chargesResult.total}
          totalPages={chargesResult.totalPages}
          sort={sort}
          dir={dir}
        />
      </section>
    </div>
  );
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function Tile({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-white shadow-ios-card p-4 md:p-5">
      <div className="text-[0.65rem] md:text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1.5 font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
        {value}
      </div>
      {hint && <div className="text-xs text-brand-night-navy/60 mt-0.5">{hint}</div>}
    </div>
  );
}
