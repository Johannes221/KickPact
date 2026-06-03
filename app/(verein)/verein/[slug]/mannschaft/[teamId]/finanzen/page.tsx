import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getTeamConfirmedChargeRuleSums } from "@/lib/db/queries/team-finances";
import { getTriggerLabel } from "@/lib/billing/trigger-labels";
import {
  categorize,
  getCategoryLabelLong,
  type TriggerCategory
} from "@/lib/billing/trigger-categories";
import { FinanzenTrendChart } from "./_components/finanzen-trend-chart";

export const metadata = { title: "Finanzen · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function FinanzenPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "viewer");
  const team = await getTeamInClub(teamId, club.id);

  if (!team) return <div className="text-sm text-brand-alert-red">Mannschaft nicht gefunden.</div>;

  // Alle confirmed Charges für dieses Team, mit Match-Datum für Trend
  const ruleSums = await getTeamConfirmedChargeRuleSums(team.id);

  const totalCents = ruleSums.reduce((acc, r) => acc + r.amountCents, 0);
  const totalCount = ruleSums.length;

  // Gruppierung nach Kategorie → nach Trigger-Type
  const byCategory: Record<TriggerCategory, Map<string, { sum: number; count: number; sample?: unknown }>> = {
    auto: new Map(),
    manual: new Map(),
    season: new Map()
  };
  for (const r of ruleSums) {
    const cat = categorize(r.triggerType);
    const bucket = byCategory[cat];
    const existing = bucket.get(r.triggerType) ?? { sum: 0, count: 0, sample: r.triggerParams };
    existing.sum += r.amountCents;
    existing.count += 1;
    bucket.set(r.triggerType, existing);
  }

  // Top-Sponsoren
  const sponsorSums = new Map<string, { name: string; sum: number; count: number }>();
  for (const r of ruleSums) {
    const key = r.sponsorDisplayName ?? "—";
    const existing = sponsorSums.get(key) ?? { name: key, sum: 0, count: 0 };
    existing.sum += r.amountCents;
    existing.count += 1;
    sponsorSums.set(key, existing);
  }
  const topSponsors = Array.from(sponsorSums.values())
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 10);

  // Monthly-Buckets für Trend-Chart: letzte 12 Monate
  const now = new Date();
  const buckets: Array<{ monthLabel: string; totalCents: number; key: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("de-DE", { month: "short" });
    buckets.push({ monthLabel, totalCents: 0, key });
  }
  const bucketByKey = new Map(buckets.map((b) => [b.key, b]));
  for (const r of ruleSums) {
    const d = r.matchDate ?? r.confirmedAt;
    if (!d) continue;
    const dd = new Date(d);
    const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
    const b = bucketByKey.get(key);
    if (b) b.totalCents += r.amountCents;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl tracking-tight">Finanzen</h1>
        <p className="text-sm text-brand-night-navy/60 mt-1">
          Übersicht aller bestätigten Charges auf diese Mannschaft.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent/5 p-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-accent-dark">
          Eingenommen insgesamt
        </div>
        <div className="font-display font-bold text-4xl md:text-5xl tracking-tight text-brand-night-navy mt-1 tabular-nums">
          {eur(totalCents)}
        </div>
        <div className="text-sm text-brand-night-navy/60 mt-1">
          aus {totalCount} ausgelösten {totalCount === 1 ? "Ereignis" : "Ereignissen"}
        </div>
      </div>

      {/* KPI-Grid pro Kategorie */}
      <div className="space-y-4">
        {(["auto", "manual", "season"] as TriggerCategory[]).map((cat) => {
          const bucket = byCategory[cat];
          const items = Array.from(bucket.entries()).sort((a, b) => b[1].sum - a[1].sum);
          if (items.length === 0) return null;
          const catSum = items.reduce((acc, [, v]) => acc + v.sum, 0);
          return (
            <section
              key={cat}
              className="rounded-2xl border border-brand-neutral/30 bg-white p-4 md:p-5"
            >
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-brand-night-navy/70">
                  {getCategoryLabelLong(cat)}
                </h2>
                <span className="font-display font-bold tabular-nums">{eur(catSum)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map(([triggerType, v]) => (
                  <div
                    key={triggerType}
                    className="rounded-xl border border-brand-neutral/20 bg-brand-off-white/50 p-3"
                  >
                    <div className="text-xs text-brand-night-navy/60">
                      {getTriggerLabel(triggerType, v.sample as Record<string, unknown> | null)}
                    </div>
                    <div className="font-display font-bold text-xl tabular-nums mt-0.5">
                      {eur(v.sum)}
                    </div>
                    <div className="text-[0.7rem] text-brand-night-navy/50">
                      {v.count} × ausgelöst
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Top Sponsoren */}
      {topSponsors.length > 0 && (
        <section className="rounded-2xl border border-brand-neutral/30 bg-white p-4 md:p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-brand-night-navy/70 mb-3">
            Top Sponsoren
          </h2>
          <ul className="divide-y divide-brand-neutral/15">
            {topSponsors.map((s, i) => (
              <li key={s.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0
                      ? "bg-amber-100 text-amber-700"
                      : i === 1
                      ? "bg-neutral-200 text-neutral-700"
                      : i === 2
                      ? "bg-orange-100 text-orange-700"
                      : "bg-brand-off-white text-brand-night-navy/50"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate font-medium">{s.name}</span>
                <span className="text-xs text-brand-night-navy/50">{s.count}×</span>
                <span className="font-semibold tabular-nums">{eur(s.sum)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Trend-Chart */}
      <FinanzenTrendChart
        data={buckets.map((b) => ({ monthLabel: b.monthLabel, totalCents: b.totalCents }))}
      />

      {totalCount === 0 && (
        <div className="rounded-2xl border border-brand-neutral/30 bg-white p-8 text-center text-sm text-brand-night-navy/60">
          Noch keine bestätigten Charges. Sobald die ersten Pacts ausgelöst werden, erscheinen sie hier.
        </div>
      )}
    </div>
  );
}
