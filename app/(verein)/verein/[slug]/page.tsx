import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getClubDashboardStats,
  listClubPledges,
  listRecentClubMatches,
  listClubSeasonPledges,
  type SeasonPledgeOutcome
} from "@/lib/db/queries/club-dashboard";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { PledgesTable } from "./_components/pledges-table";

export const metadata = { title: "Vereins-Dashboard · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export default async function ClubDashboard({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) return null;

  const [stats, pledgeRows, recentMatches, seasonPledges, teamRows] = await Promise.all([
    getClubDashboardStats(club.id),
    listClubPledges(club.id),
    listRecentClubMatches(club.id, 10),
    listClubSeasonPledges(club.id),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.clubId, club.id))
  ]);

  return (
    <div className="space-y-6 md:space-y-10">
      {/* Stat-Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard label="Mannschaften" value={String(stats.teamCount)} />
        <StatCard label="Aktive Sponsoren" value={String(stats.activeSponsors)} />
        <StatCard label="Aktive Pledges" value={String(stats.activePledges)} />
        <StatCard
          label="Charges Saison"
          value={eur(stats.totalChargesSeasonCents)}
          hint="bestätigt"
        />
        <StatCard
          label="Mannschaftskasse"
          value={eur(stats.accruedMannschaftskasseCents)}
          hint="aufgelaufen"
        />
      </div>

      {/* Sponsoren-Wetten */}
      <PledgesTable
        rows={pledgeRows}
        teams={teamRows.map((t) => ({ id: t.id, name: t.name }))}
        slug={slug}
      />

      {/* Letzte Spiele */}
      <RecentMatchesSection rows={recentMatches} slug={slug} />

      {/* Saison-Wetten */}
      <SeasonPledgesSection rows={seasonPledges} />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-brand-neutral/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.6rem] md:text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-display font-black text-xl md:text-3xl tracking-tight text-brand-night-navy">
          {value}
        </div>
        {hint && <div className="text-[0.65rem] md:text-xs text-brand-night-navy/40 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function RecentMatchesSection({
  rows,
  slug
}: {
  rows: Awaited<ReturnType<typeof listRecentClubMatches>>;
  slug: string;
}) {
  return (
    <section>
      <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
        Letzte Spiele
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
          Noch keine ausgewerteten Spiele. Sobald Fußball.de Endergebnisse liefert, tauchen sie hier auf.
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Datum</th>
                  <th className="px-4 py-3 text-left font-semibold">Mannschaft</th>
                  <th className="px-4 py-3 text-left font-semibold">Spiel</th>
                  <th className="px-4 py-3 text-right font-semibold">Ergebnis</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges</th>
                  <th className="px-4 py-3 text-right font-semibold">Summe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {rows.map((m) => (
                  <tr key={m.matchId} className="relative hover:bg-brand-off-white/60 cursor-pointer">
                    <td className="px-4 py-3 font-mono tabular-nums text-brand-night-navy">
                      {/* Stretched link: covers the entire row */}
                      <Link
                        href={`/verein/${slug}/spiel/${m.matchId}`}
                        className="absolute inset-0"
                        aria-label={`${m.heimName} – ${m.gastName}`}
                      />
                      {formatDate(m.datum)}
                    </td>
                    <td className="px-4 py-3 text-brand-night-navy">{m.teamName}</td>
                    <td className="px-4 py-3 text-brand-night-navy">
                      {m.heimName} – {m.gastName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-brand-night-navy">
                      {m.ergebnisHeim ?? "–"}:{m.ergebnisGast ?? "–"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-night-navy">
                      {m.chargesCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-night-navy">
                      {eur(m.chargesSumCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <ul className="md:hidden space-y-2">
            {rows.map((m) => (
              <li
                key={`m-${m.matchId}`}
                className="rounded-xl border border-brand-neutral/40 bg-white p-3"
              >
                <Link
                  href={`/verein/${slug}/spiel/${m.matchId}`}
                  className="block"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-brand-night-navy/50 tabular-nums">
                      {formatDate(m.datum)}
                    </span>
                    <span className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                      {m.teamName}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-sm text-brand-night-navy truncate">
                      {m.heimName} – {m.gastName}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-brand-night-navy">
                      {m.ergebnisHeim ?? "–"}:{m.ergebnisGast ?? "–"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-brand-night-navy/50">
                      {m.chargesCount} {m.chargesCount === 1 ? "Charge" : "Charges"}
                    </span>
                    <span className="font-mono tabular-nums text-brand-night-navy">
                      {eur(m.chargesSumCents)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SeasonPledgesSection({
  rows
}: {
  rows: Awaited<ReturnType<typeof listClubSeasonPledges>>;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
          Saison-Wetten
        </h2>
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
          Keine aktiven Saison-Wetten. Sponsoren können in ihrem Dashboard auf Aufstieg, Klassenerhalt etc. wetten.
        </div>
      </section>
    );
  }
  return (
    <section>
      <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
        Saison-Wetten
      </h2>
      <ul className="space-y-2">
        {rows.map((r) => {
          const meta = TRIGGER_META[r.triggerType];
          return (
            <li
              key={`${r.pledgeId}-${r.ruleId}`}
              className="rounded-xl border border-brand-neutral/40 bg-white p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg md:text-xl">{meta?.emoji ?? "💚"}</span>
                  <span className="font-display font-black text-sm md:text-base text-brand-night-navy">
                    {meta?.label ?? r.triggerType}
                  </span>
                </div>
                <div className="text-xs text-brand-night-navy/60 mt-1 truncate">
                  {r.sponsorDisplayName} · {r.teamName} · Saison {r.teamSaison}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:gap-1">
                <span className="font-mono tabular-nums font-semibold text-brand-night-navy">
                  {eur(r.amountCents)}
                </span>
                <SeasonOutcomeBadge outcome={r.outcome} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SeasonOutcomeBadge({ outcome }: { outcome: SeasonPledgeOutcome }) {
  const map: Record<SeasonPledgeOutcome, { label: string; cls: string }> = {
    fulfilled: { label: "Erfüllt", cls: "bg-emerald-100 text-emerald-800" },
    missed: { label: "Verfehlt", cls: "bg-rose-100 text-rose-700" },
    pending: { label: "Wartet noch", cls: "bg-neutral-100 text-neutral-600" }
  };
  const entry = map[outcome];
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] md:text-xs font-semibold " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}
