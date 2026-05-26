import Link from "next/link";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, seasonResults } from "@/lib/db/schema";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { charges as chargesTable } from "@/lib/db/schema/charges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listMatchesForTeam, getMatchChargesSummaryForTeam } from "@/lib/db/queries/matches";
import { listClubSeasonPledges } from "@/lib/db/queries/club-dashboard";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { inngest } from "@/lib/inngest/client";

export const metadata = { title: "Mannschaft · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "viewer");

  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const [matchRows, chargesSummary, seasonResult, seasonPledges] = await Promise.all([
    listMatchesForTeam(team.id, 30),
    getMatchChargesSummaryForTeam(team.id),
    db
      .select()
      .from(seasonResults)
      .where(and(eq(seasonResults.teamId, team.id), eq(seasonResults.saison, team.saison)))
      .limit(1)
      .then((r) => r[0] ?? null),
    listClubSeasonPledges(club.id).then((rows) => rows.filter((r) => r.teamId === team.id))
  ]);

  // Saison-Stats aus echten Matches berechnen
  const finishedMatches = matchRows.filter(
    (m) => m.status === "finished" && m.ergebnisHeim !== null
  );
  const teamWord = team.name.toLowerCase().split(" ")[0];
  let wins = 0, losses = 0, draws = 0, goalsFor = 0, goalsAgainst = 0;
  for (const m of finishedMatches) {
    const isHeim = m.heimName.toLowerCase().includes(teamWord);
    const gF = isHeim ? (m.ergebnisHeim ?? 0) : (m.ergebnisGast ?? 0);
    const gA = isHeim ? (m.ergebnisGast ?? 0) : (m.ergebnisHeim ?? 0);
    goalsFor += gF;
    goalsAgainst += gA;
    if (gF > gA) wins++;
    else if (gF < gA) losses++;
    else draws++;
  }
  const totalCharges = [...chargesSummary.values()].reduce((s, v) => s + v, 0);

  // Falls noch keine Spiele für dieses Team vorhanden sind, einen On-Demand-Crawl
  // anstoßen. Dedup über Event-ID (1h-Bucket) verhindert Mehrfach-Trigger bei Reloads.
  if (matchRows.length === 0 && team.fussballdeTeamId) {
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    inngest
      .send({
        id: `team-crawl-${team.id}-${hourBucket}`,
        name: "crawler/team.crawl",
        data: { teamId: team.id }
      })
      .catch((err) => {
        console.error("[team-page] inngest.send failed", err);
      });
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div>
        <Link href={`/verein/${slug}`} className="text-sm text-brand-night-navy/60 hover:text-accent">
          ← Vereins-Dashboard
        </Link>
        <h2 className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          {team.name}
        </h2>
        <p className="text-sm text-brand-night-navy/60">Saison {team.saison}</p>
      </div>

      {/* Saison-Stats */}
      {finishedMatches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Spiele", value: finishedMatches.length },
            { label: "S/U/N", value: `${wins}/${draws}/${losses}` },
            { label: "Tore", value: `${goalsFor}:${goalsAgainst}` },
            {
              label: "Sponsor-€",
              value: eur(totalCharges),
              accent: true
            }
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-brand-neutral/40 bg-white p-3">
              <div className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                {s.label}
              </div>
              <div
                className={`font-display font-black text-xl tracking-tight mt-1 ${s.accent ? "text-accent" : "text-brand-night-navy"}`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Saison-Wetten dieser Mannschaft */}
      {seasonPledges.length > 0 && (
        <section>
          <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
            Saison-Wetten
          </h3>
          <ul className="space-y-2">
            {seasonPledges.map((r) => {
              const meta = (
                TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>
              )[r.triggerType];
              const outcomeColors = {
                fulfilled: "bg-emerald-100 text-emerald-800",
                missed: "bg-rose-100 text-rose-700",
                pending: "bg-neutral-100 text-neutral-600"
              };
              const outcomeLabels = {
                fulfilled: "Erfüllt",
                missed: "Verfehlt",
                pending: "Wartet"
              };
              return (
                <li
                  key={`${r.pledgeId}-${r.ruleId}`}
                  className="rounded-xl border border-brand-neutral/40 bg-white p-3 flex items-center gap-3"
                >
                  <span className="text-2xl shrink-0">{meta?.emoji ?? "🏆"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-brand-night-navy">
                      {meta?.label ?? r.triggerType}
                    </div>
                    <div className="text-xs text-brand-night-navy/60">{r.sponsorDisplayName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-black text-base text-brand-night-navy">
                      {eur(r.amountCents)}
                    </div>
                    <span
                      className={
                        "inline-block rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest " +
                        outcomeColors[r.outcome]
                      }
                    >
                      {outcomeLabels[r.outcome]}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Saison-Endstand: read-only Block, Bearbeitung in Einstellungen/Saison */}
      <SeasonStatusBlock
        slug={slug}
        teamId={team.id}
        saison={team.saison}
        result={seasonResult}
      />

      {/* Spiele */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy">
            Alle Spiele
          </h3>
          <span className="text-xs text-brand-night-navy/50">
            {matchRows.length} Spiel{matchRows.length === 1 ? "" : "e"}
          </span>
        </div>
        {matchRows.length === 0 ? (
          <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
            <div className="flex items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span>
                Wir suchen aktuell nach den letzten Spielen. Das kann ein paar Minuten dauern —
                sobald neue Spiele auftauchen, erscheinen sie hier automatisch.
              </span>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {matchRows.map((m) => {
              const isHeim = m.heimName.toLowerCase().includes(teamWord);
              const gF = isHeim ? (m.ergebnisHeim ?? null) : (m.ergebnisGast ?? null);
              const gA = isHeim ? (m.ergebnisGast ?? null) : (m.ergebnisHeim ?? null);
              const matchCharges = chargesSummary.get(m.id) ?? 0;
              const resultColor =
                gF === null
                  ? "border-brand-neutral/40"
                  : gF > (gA ?? 0)
                    ? "border-emerald-200"
                    : gF < (gA ?? 0)
                      ? "border-rose-200"
                      : "border-amber-200";

              return (
                <li key={m.id}>
                  <Link
                    href={`/verein/${slug}/spiel/${m.id}`}
                    className={`block rounded-lg border bg-white p-3 md:p-4 hover:bg-brand-off-white/60 transition-colors ${resultColor}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-brand-night-navy/50 mb-1">
                          {m.datum.toLocaleDateString("de-DE", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                            year: "2-digit"
                          })}
                        </div>
                        <div className="font-semibold text-sm text-brand-night-navy truncate">
                          {m.heimName}
                          <span className="font-mono text-accent mx-2">
                            {m.ergebnisHeim ?? "—"}:{m.ergebnisGast ?? "—"}
                          </span>
                          {m.gastName}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {matchCharges > 0 && (
                          <span className="font-mono tabular-nums text-xs font-semibold text-accent">
                            {eur(matchCharges)}
                          </span>
                        )}
                        <span className="text-brand-night-navy/30">→</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

interface SeasonStatusResult {
  finalPosition: number | null;
  teamsInLeague: number | null;
  promoted: boolean;
  relegated: boolean;
  cupRoundReached: string | null;
  customNotes: string | null;
}

function SeasonStatusBlock({
  slug,
  teamId,
  saison,
  result
}: {
  slug: string;
  teamId: string;
  saison: string;
  result: SeasonStatusResult | null;
}) {
  const settingsHref = `/verein/${slug}/mannschaft/${teamId}/einstellungen/saison`;

  if (!result) {
    return (
      <section
        aria-label={`Saison-Endstand ${saison}`}
        className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 md:p-5"
      >
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Saison-Endstand {saison}
        </h3>
        <p className="mt-1 text-xs md:text-sm text-brand-night-navy/70">
          Saison läuft noch — Endstand wird am Saisonende automatisch übernommen.{" "}
          <Link href={settingsHref} className="text-accent hover:underline font-semibold">
            Manuell setzen
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={`Saison-Endstand ${saison}`}
      className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Saison-Endstand {saison}
          </h3>
          <div className="mt-2 text-xs md:text-sm text-brand-night-navy/70 space-y-0.5">
            {result.finalPosition && (
              <div>
                📊 Endplatz: <strong>{result.finalPosition}</strong>
                {result.teamsInLeague && ` von ${result.teamsInLeague}`}
              </div>
            )}
            {result.promoted && <div>⬆️ Aufstieg geschafft</div>}
            {result.relegated && <div>⬇️ Abgestiegen</div>}
            {result.cupRoundReached && <div>🏆 Pokal: {result.cupRoundReached}</div>}
            {result.customNotes && <div>📝 {result.customNotes}</div>}
            {!result.finalPosition &&
              !result.promoted &&
              !result.relegated &&
              !result.cupRoundReached &&
              !result.customNotes && (
                <div className="text-brand-night-navy/50">Noch keine Details eingetragen.</div>
              )}
          </div>
        </div>
        <Link
          href={settingsHref}
          className="text-xs md:text-sm font-semibold text-accent hover:underline shrink-0"
        >
          Bearbeiten →
        </Link>
      </div>
    </section>
  );
}
