import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { triggerLabel, triggerEmoji } from "@/lib/triggers/labels";
import {
  getRangeForOption,
  getSponsorBalance,
  parseCustomRange,
  type DateRange,
  type SponsorRangeOption
} from "@/lib/db/queries/sponsor-reporting";
import {
  BilanzRangeSelector,
  type RangePreset
} from "./_components/bilanz-range-selector";
import { BilanzMonthlyChart } from "./_components/bilanz-monthly-chart";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Bilanz · KickPact" };

type SP = {
  range?: string;
  from?: string;
  to?: string;
};

const PRESET_VALUES: readonly RangePreset[] = [
  "this-month",
  "this-year",
  "this-season",
  "all-time"
];

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function eurNoSign(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function resolveRange(sp: SP): {
  range: DateRange;
  preset: RangePreset | "custom";
  from?: string;
  to?: string;
} {
  const raw = sp.range;
  if (raw === "custom") {
    const custom = parseCustomRange({ get: (k) => (sp as Record<string, string | undefined>)[k] ?? null });
    if (custom) {
      return { range: custom, preset: "custom", from: sp.from, to: sp.to };
    }
    // custom mit fehlenden Werten → fallback this-month, behält "custom" Tab aktiv
    return {
      range: getRangeForOption("this-month"),
      preset: "custom",
      from: sp.from,
      to: sp.to
    };
  }
  if ((PRESET_VALUES as readonly string[]).includes(raw ?? "")) {
    const preset = raw as RangePreset;
    return { range: getRangeForOption(preset as SponsorRangeOption), preset };
  }
  return { range: getRangeForOption("this-month"), preset: "this-month" };
}

function formatRangeLabel(range: DateRange): string {
  const sameYear = range.from.getUTCFullYear() === range.to.getUTCFullYear();
  const fmt = (d: Date) =>
    d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: sameYear ? undefined : "numeric"
    });
  // to ist exklusiv → minus 1 Tag für die UI-Anzeige
  const toMinus1 = new Date(range.to.getTime() - 24 * 60 * 60 * 1000);
  return `${fmt(range.from)} – ${fmt(toMinus1)}`;
}

export default async function BilanzPage({
  searchParams
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireUser();
  const sponsor = await findSponsorForUser(user.id);

  if (!sponsor) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 md:mb-10">
          <PageHeader className="md:hidden" title="Bilanz" />
          <h1 className="hidden md:block text-2xl md:text-4xl font-bold text-brand-night-navy">
            Bilanz
          </h1>
        </div>
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8">
          <p className="text-sm md:text-base text-brand-night-navy/70">
            Du brauchst zuerst ein Sponsor-Profil und mindestens einen aktiven
            Pact, bevor hier eine Bilanz erscheint.
          </p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const { range, preset, from, to } = resolveRange(sp);
  const balance = await getSponsorBalance(sponsor.id, range);

  // Avg pro Match-Event = totalCents / eventsCount (statt /matches.count,
  // weil ein Match mehrere Charge-Events erzeugen kann)
  const avgPerEvent = balance.eventsCount > 0
    ? balance.totalCents / balance.eventsCount
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        className="md:hidden"
        title="Bilanz"
        subtitle="Übersicht deiner Beiträge nach Zeitraum, Verein, Mannschaft und Ereignis."
      />
      <div className="hidden md:block">
        <h1 className="text-2xl md:text-4xl font-bold text-brand-night-navy">
          Bilanz
        </h1>
        <p className="mt-1.5 text-sm md:text-base text-brand-night-navy/60">
          Übersicht deiner Beiträge nach Zeitraum, Verein, Mannschaft und Ereignis.
        </p>
      </div>

      <BilanzRangeSelector current={preset} from={from} to={to} />

      <div className="text-xs text-brand-night-navy/50 tabular-nums">
        Zeitraum: {formatRangeLabel(range)}
      </div>

      {/* 4 KPI-Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Total"
          primary={eur(balance.totalCents)}
          secondary={`${balance.eventsCount} ${balance.eventsCount === 1 ? "Ereignis" : "Ereignisse"}`}
        />
        <KpiTile
          label="Pacts aktiv"
          primary={String(balance.pledgeCount)}
          secondary="im Zeitraum getriggert"
        />
        <KpiTile
          label="Vereine"
          primary={String(balance.clubCount)}
          secondary={balance.clubCount === 1 ? "Verein gesponsert" : "Vereine gesponsert"}
        />
        <KpiTile
          label="Ø pro Ereignis"
          primary={eur(Math.round(avgPerEvent))}
          secondary="Durchschnitt"
        />
      </div>

      {/* Monatlicher Bar-Chart */}
      <BilanzMonthlyChart
        data={balance.byMonth.map((m) => ({
          month: m.month,
          totalCents: m.totalCents
        }))}
      />

      {/* Breakdown per Verein */}
      <BreakdownSection
        title="Pro Verein"
        rows={balance.byClub.map((c) => ({
          key: c.clubId,
          label: c.clubName,
          sub: c.clubSlug,
          totalCents: c.totalCents,
          eventsCount: c.eventsCount,
          href: `/verein/${c.clubSlug}`
        }))}
        emptyText="Noch keine Vereine im Zeitraum."
      />

      {/* Breakdown per Team */}
      <BreakdownSection
        title="Pro Mannschaft"
        rows={balance.byTeam.map((t) => ({
          key: t.teamId,
          label: t.teamName,
          sub: t.clubName,
          totalCents: t.totalCents,
          eventsCount: t.eventsCount,
          href: `/verein/${t.clubSlug}/mannschaft/${t.teamId}`
        }))}
        emptyText="Noch keine Mannschaften im Zeitraum."
      />

      {/* Breakdown per Trigger */}
      <section className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-brand-night-navy/70 mb-3">
          Pro Trigger-Typ
        </h2>
        {balance.byTrigger.length === 0 ? (
          <p className="text-sm text-brand-night-navy/60">
            Noch keine Trigger im Zeitraum ausgelöst.
          </p>
        ) : (
          <ul className="divide-y divide-brand-neutral/15">
            {balance.byTrigger.map((t) => (
              <li
                key={t.triggerType}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-xl shrink-0" aria-hidden>
                  {triggerEmoji(t.triggerType)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {triggerLabel(t.triggerType)}
                  </div>
                  <div className="text-xs text-brand-night-navy/50 tabular-nums">
                    {t.eventsCount}× ausgelöst
                  </div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-accent-dark">
                  {eurNoSign(t.totalCents)} €
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {balance.eventsCount === 0 && (
        <div className="rounded-2xl bg-white shadow-ios-card p-8 text-center text-sm text-brand-night-navy/60">
          Im gewählten Zeitraum hat noch kein Pact gegriffen. Wähle einen anderen
          Zeitraum oder warte bis deine Mannschaft das nächste Spiel hat.
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  primary,
  secondary
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-ios-card p-4">
      <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1 text-xl md:text-2xl font-bold tabular-nums text-brand-night-navy break-words">
        {primary}
      </div>
      <div className="mt-1 text-xs text-brand-night-navy/60 truncate">
        {secondary}
      </div>
    </div>
  );
}

function BreakdownSection({
  title,
  rows,
  emptyText
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    sub: string;
    totalCents: number;
    eventsCount: number;
    href?: string;
  }>;
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wider text-brand-night-navy/70 mb-3">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-brand-night-navy/60">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-brand-neutral/15">
          {rows.map((r) => {
            const inner = (
              <>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.label}</div>
                  <div className="text-xs text-brand-night-navy/50 truncate">
                    {r.sub} · {r.eventsCount}× ausgelöst
                  </div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-accent-dark whitespace-nowrap">
                  {(r.totalCents / 100).toLocaleString("de-DE", {
                    style: "currency",
                    currency: "EUR"
                  })}
                </span>
              </>
            );
            return (
              <li
                key={r.key}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                {r.href ? (
                  <Link
                    href={r.href}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:bg-brand-off-white/60 -mx-2 px-2 py-1 rounded-md transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
