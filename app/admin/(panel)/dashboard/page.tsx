import Link from "next/link";
import { getPlatformKpis, getTopClubsThisMonth } from "@/lib/db/queries/platform-stats";
import { MrrChart } from "./_components/mrr-chart";

export const metadata = { title: "Dashboard · Admin · KickPact" };
export const dynamic = "force-dynamic";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  });
}

const TRIGGER_LABELS: Record<string, string> = {
  goal_total: "Tore (total)",
  goal_by_player: "Tor (Spieler)",
  win: "Sieg",
  loss: "Niederlage",
  draw: "Unentschieden",
  clean_sheet: "Zu Null",
  comeback_win: "Comeback-Sieg",
  hattrick: "Hattrick",
  goal_diff_min: "Tordiff. min.",
  goals_scored_min: "Tore min.",
  special_goal: "Special Tor",
  yellow_card: "Gelbe Karte",
  red_card: "Rote Karte",
  assist: "Vorlage",
  man_of_match: "Man of Match",
  custom: "Custom",
  season_promotion: "Saison Aufstieg",
  season_no_relegation: "Klassenerhalt",
  season_table_position: "Tabellenplatz",
  season_champion: "Meister",
  season_cup_round: "Pokal-Runde",
  season_custom: "Saison Custom"
};

function triggerLabel(t: string): string {
  return TRIGGER_LABELS[t] ?? t;
}

interface TileProps {
  label: string;
  value: string;
  caption?: string;
  emoji?: string;
}

function KpiTile({ label, value, caption, emoji }: TileProps) {
  return (
    <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6">
      {emoji && <div className="text-2xl mb-2">{emoji}</div>}
      <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </div>
      <div className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy tabular-nums">
        {value}
      </div>
      {caption && (
        <div className="mt-1 text-xs text-brand-night-navy/60">{caption}</div>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [kpis, topClubs] = await Promise.all([
    getPlatformKpis(),
    getTopClubsThisMonth(5)
  ]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <KpiTile
          emoji="🏟️"
          label="Aktive Vereine"
          value={kpis.activeClubs.toLocaleString("de-DE")}
          caption="Subscriptions in status=active"
        />
        <KpiTile
          emoji="💶"
          label="MRR"
          value={eur(kpis.mrrCents)}
          caption="Monatlich wiederkehrend (geschätzt)"
        />
        <KpiTile
          emoji="📈"
          label="Trial → Paid (30d)"
          value={`${kpis.trialToPaidPercent} %`}
          caption="Conversion der letzten 30 Tage"
        />
        <KpiTile
          emoji="🚪"
          label="Churn (30d)"
          value={`${kpis.churnPercent} %`}
          caption="Cancel-Rate vs. Baseline 30d alt"
        />
        <KpiTile
          emoji="🎯"
          label="Ø Pact"
          value={eur(kpis.avgPledgeAmountCents)}
          caption="Mittelwert aller aktiven Pact-Regeln"
        />
        <KpiTile
          emoji="⚡"
          label="Top-Trigger"
          value={
            kpis.topTrigger
              ? triggerLabel(kpis.topTrigger.triggerType)
              : "—"
          }
          caption={
            kpis.topTrigger
              ? `${kpis.topTrigger.chargeCount.toLocaleString("de-DE")} Charges`
              : "Noch keine Daten"
          }
        />
      </div>

      <MrrChart series={kpis.mrrSeries} />

      <section>
        <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy mb-3">
          Top-5 Vereine (diesen Monat)
        </h2>
        {topClubs.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
            Noch keine Charges in diesem Monat.
          </div>
        ) : (
          <ul className="rounded-2xl border border-brand-neutral/40 bg-white divide-y divide-brand-neutral/20">
            {topClubs.map((c, i) => (
              <li key={c.clubId} className="px-4 md:px-5 py-3 flex items-center gap-4">
                <span className="font-display font-black text-sm md:text-base text-brand-night-navy/30 tabular-nums w-6">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/admin/vereine/${c.clubSlug}`}
                    className="font-display font-bold text-sm md:text-base tracking-tight text-brand-night-navy hover:text-accent transition-colors"
                  >
                    {c.clubName}
                  </Link>
                  <div className="text-xs text-brand-night-navy/50">
                    {c.chargeCount.toLocaleString("de-DE")} Charges
                  </div>
                </div>
                <div className="font-mono tabular-nums font-semibold text-accent-dark text-sm md:text-base">
                  {eur(c.totalCents)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
