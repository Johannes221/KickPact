import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { listMatchesForTeam, getMatchChargesSummaryForTeam } from "@/lib/db/queries/matches";

export const metadata = { title: "Spiele · KickPact" };

type ResultFilter = "all" | "win" | "loss" | "draw";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getResult(
  m: { ergebnisHeim: number | null; ergebnisGast: number | null },
  isHeim: boolean
): "win" | "loss" | "draw" | "open" {
  if (m.ergebnisHeim == null || m.ergebnisGast == null) return "open";
  const own = isHeim ? m.ergebnisHeim : m.ergebnisGast;
  const opp = isHeim ? m.ergebnisGast : m.ergebnisHeim;
  if (own > opp) return "win";
  if (own < opp) return "loss";
  return "draw";
}

export default async function SpielePage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; teamId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { slug, teamId } = await params;
  const sp = await searchParams;
  const resultFilter: ResultFilter = (sp.result as ResultFilter) ?? "all";

  const { club } = await assertClubAccess(slug, "viewer");
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) return <div className="text-sm text-brand-alert-red">Mannschaft nicht gefunden.</div>;

  const matches = await listMatchesForTeam(team.id, 200);
  const chargesByMatch = await getMatchChargesSummaryForTeam(team.id);

  const teamWord = team.name.toLowerCase().split(" ")[0];
  const enriched = matches
    .filter((m) => m.status === "finished")
    .map((m) => {
      const isHeim = m.heimName?.toLowerCase().includes(teamWord) ?? false;
      const result = getResult(m, isHeim);
      const chargesSum = chargesByMatch.get(m.id) ?? 0;
      return { ...m, isHeim, result, chargesSum };
    });

  const filtered = resultFilter === "all" ? enriched : enriched.filter((m) => m.result === resultFilter);
  const base = `/verein/${slug}/mannschaft/${teamId}/spiele`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight">Spiele</h1>
        <p className="text-sm text-brand-night-navy/60 mt-1">
          Alle gescrapten Spiele dieser Mannschaft, sortiert nach Datum.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-brand-neutral/30 bg-brand-off-white p-1 w-fit">
        {(["all", "win", "draw", "loss"] as ResultFilter[]).map((r) => (
          <Link
            key={r}
            href={`${base}?result=${r}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              resultFilter === r
                ? "bg-white text-brand-night-navy shadow-sm"
                : "text-brand-night-navy/60 hover:text-brand-night-navy"
            }`}
          >
            {r === "all" ? "Alle" : r === "win" ? "Siege" : r === "loss" ? "Niederlagen" : "Unentschieden"}
          </Link>
        ))}
        <div className="px-3 py-1.5 text-xs text-brand-night-navy/50 self-center">
          {filtered.length} Spiele
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/30 bg-white p-8 text-center text-sm text-brand-night-navy/60">
          Noch keine Spiele in diesem Filter.
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-neutral/30 bg-white overflow-hidden">
          <ul className="divide-y divide-brand-neutral/15">
            {filtered.map((m) => {
              const own = m.isHeim ? m.ergebnisHeim : m.ergebnisGast;
              const opp = m.isHeim ? m.ergebnisGast : m.ergebnisHeim;
              const resultLabel =
                m.result === "win" ? "S" : m.result === "loss" ? "N" : m.result === "draw" ? "U" : "·";
              const resultCls =
                m.result === "win"
                  ? "bg-accent/15 text-accent-dark"
                  : m.result === "loss"
                  ? "bg-brand-alert-red/15 text-brand-alert-red"
                  : "bg-neutral-200 text-neutral-700";
              return (
                <li key={m.id}>
                  <Link
                    href={`/verein/${slug}/spiel/${m.id}`}
                    className="flex items-center gap-3 md:gap-4 px-4 py-3 hover:bg-brand-off-white/50 transition-colors"
                  >
                    <span
                      className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${resultCls}`}
                      aria-label={`Ergebnis: ${resultLabel}`}
                    >
                      {resultLabel}
                    </span>
                    <span className="shrink-0 text-xs text-brand-night-navy/50 w-20">
                      {fmtDate(m.datum)}
                    </span>
                    <span className="flex-1 min-w-0 text-sm">
                      <span className={m.isHeim ? "font-semibold" : "text-brand-night-navy/70"}>
                        {m.heimName}
                      </span>
                      <span className="mx-2 text-brand-night-navy/40">vs</span>
                      <span className={!m.isHeim ? "font-semibold" : "text-brand-night-navy/70"}>
                        {m.gastName}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {own ?? "—"}:{opp ?? "—"}
                    </span>
                    {m.chargesSum > 0 && (
                      <span className="hidden sm:inline-block shrink-0 text-xs font-semibold text-accent-dark tabular-nums">
                        {eur(m.chargesSum)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
