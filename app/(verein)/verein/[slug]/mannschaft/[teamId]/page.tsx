import Link from "next/link";
import { Trophy, Medal, ArrowUp, ArrowDown, StickyNote } from "lucide-react";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listMatchesForTeam, getMatchChargesSummaryForTeam } from "@/lib/db/queries/matches";
import { listClubSeasonPledges } from "@/lib/db/queries/club-dashboard";
import { computeTeamSeasonStats } from "@/lib/db/queries/team-dashboard";
import {
  getFullTeamInClub,
  getSeasonResultForTeam
} from "@/lib/db/queries/team-lifecycle";
import { getClubById } from "@/lib/db/queries/club-admin";
import { countPledgesForTeam } from "@/lib/db/queries/pledges";
import { getTeamLicensePlanDirect } from "@/lib/db/queries/subscriptions";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { inngest } from "@/lib/inngest/client";
import { isTeamCrawling } from "@/lib/crawler/crawl-status";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import { markCrawlStarted } from "@/lib/db/queries/crawler";
import { TeamSetupChecklist } from "./_components/team-setup-checklist";
import { CrawlAutoRefresh } from "./_components/crawl-auto-refresh";
import { PageHeader } from "@/components/shared/page-header";

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

  const team = await getFullTeamInClub(teamId, club.id);

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
    getSeasonResultForTeam(team.id, team.saison).then((r) => r ?? null),
    listClubSeasonPledges(club.id).then((rows) => rows.filter((r) => r.teamId === team.id))
  ]);

  // Saison-Stats aus echten Matches berechnen
  const { games, wins, draws, losses, goalsFor, goalsAgainst } =
    await computeTeamSeasonStats(team.id, team.name, club.name);
  const teamNames = [team.name, club.name];
  const totalCharges = [...chargesSummary.values()].reduce((s, v) => s + v, 0);

  // Setup-Checkliste: Daten für "Anstehende Aufgaben".
  const [clubBilling, pledgeCount, licenseRow] = await Promise.all([
    getClubById(club.id),
    countPledgesForTeam(team.id),
    getTeamLicensePlanDirect(team.id)
  ]);
  const hasIban = !!clubBilling?.iban;
  const hasSponsor = pledgeCount > 0;
  const teamBase = `/verein/${slug}/mannschaft/${team.id}`;

  // Saison "2526" → lesbar "25/26".
  const saisonLabel =
    team.saison.length === 4
      ? `${team.saison.slice(0, 2)}/${team.saison.slice(2)}`
      : team.saison;

  // Verifikations-Scope: Einzel-Mannschaft (basic/pro) verifiziert die
  // MANNSCHAFT selbst (team.verifiedAt). Nur bei Vereinslizenz (plan='verein')
  // wird der VEREIN verifiziert und die Teams erben das (clubs.verifiedAt).
  const isVereinslizenz = licenseRow?.plan === "verein";
  const verifyItem = isVereinslizenz
    ? {
        done: !!clubBilling?.verifiedAt,
        label: "Verein verifizieren",
        hint: "Nachweis hochladen — bis dahin werden Rechnungen zurückgehalten.",
        href: `/verein/${slug}/verifikation`
      }
    : {
        done: !!team.verifiedAt,
        label: "Mannschaft verifizieren",
        hint: "Nachweis hochladen — bis dahin werden Rechnungen zurückgehalten.",
        href: `${teamBase}/verifikation`
      };
  const checklistItems = [
    verifyItem,
    {
      done: hasIban,
      label: "IBAN / Rechnungsdaten hinterlegen",
      hint: "IBAN + Absenderdaten für die Sponsoren-Rechnungen eintragen.",
      href: `${teamBase}/einstellungen#zahlungsdaten`
    },
    {
      done: !!team.logoUrl,
      label: "Logo hinzufügen",
      hint: "Euer Wappen erscheint auf dem Profil und den Sponsoren-Rechnungen.",
      href: `${teamBase}/einstellungen`
    },
    {
      done: hasSponsor,
      label: "Ersten Sponsor gewinnen",
      hint: "Einladungslink teilen oder Sponsor einladen.",
      href: `${teamBase}/sponsoren`
    }
  ];

  // Läuft gerade ein Crawl für dieses Team? Steuert das „Spiele werden geladen"-
  // Banner + das Client-Polling (CrawlAutoRefresh).
  let isCrawling = isTeamCrawling(team.crawlStartedAt, team.crawlCompletedAt);

  // Falls noch keine Spiele da sind UND aktuell kein Crawl läuft → On-Demand-Crawl
  // anstoßen. Dedup über Event-ID (1h-Bucket) verhindert Mehrfach-Trigger bei
  // Reloads. crawlStartedAt wird direkt gesetzt, damit das Banner sofort in
  // diesem Render erscheint (statt erst beim ersten Crawler-Step).
  if (matchRows.length === 0 && team.fussballdeTeamId && !isCrawling) {
    await markCrawlStarted(team.id);
    isCrawling = true;
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
    <div className="space-y-5 md:space-y-6">
      {/* Mannschafts-Titel: EIN vollständiger, sauber umbrechender Titel
          (kein Truncate, keine Display-Font-Silbentrennung), Kontext + Saison
          als eine dezente Subtitle-Zeile. */}
      <PageHeader
        title={team.name}
        subtitle={`${club.name} · Saison ${saisonLabel}`}
      />

      <TeamSetupChecklist
        items={checklistItems}
        storageKey={`team-checklist-${team.id}`}
      />

      {/* Saison-Stats */}
      {games > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Spiele", value: games },
            { label: "Bilanz", value: `${wins}/${draws}/${losses}` },
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
                className={`font-display font-bold text-xl tracking-tight mt-1 ${s.accent ? "text-accent" : "text-brand-night-navy"}`}
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
          <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy mb-3">
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
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-dark">
                    <TriggerIcon type={r.triggerType} className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-brand-night-navy">
                      {meta?.label ?? r.triggerType}
                    </div>
                    <div className="text-xs text-brand-night-navy/60">{r.sponsorDisplayName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-base text-brand-night-navy">
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
          <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
            Alle Spiele
          </h3>
          <span className="text-xs text-brand-night-navy/50">
            {matchRows.length} Spiel{matchRows.length === 1 ? "" : "e"}
          </span>
        </div>
        {/* Crawl-Banner: erscheint solange der Job läuft — auch wenn schon
            Spiele geladen sind. Neue Spiele tauchen per Auto-Refresh nach und
            nach darunter auf. */}
        {isCrawling && (
          <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm text-brand-night-navy/70">
            <div className="flex items-center gap-3">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse" />
              <span>
                Spiele werden aktuell geladen. Das kann einen Moment dauern — sie
                tauchen nach und nach hier auf, ganz automatisch.
              </span>
            </div>
          </div>
        )}

        {/* Unsichtbarer Poller (nur aktiv während des Crawls). */}
        <CrawlAutoRefresh
          teamId={team.id}
          isCrawling={isCrawling}
          matchCount={matchRows.length}
        />

        {matchRows.length === 0 ? (
          !isCrawling && (
            <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
              Für diese Mannschaft wurden noch keine Spiele gefunden. Sobald die
              Saison startet, erscheinen sie hier automatisch.
            </div>
          )
        ) : (
          <ul className="space-y-2">
            {matchRows.map((m) => {
              const isHeim = detectTeamSide(teamNames, m.heimName) === "heim";
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
                    href={`/verein/${slug}/mannschaft/${team.id}/spiel/${m.id}`}
                    className={`block rounded-lg border bg-white p-3 md:p-4 hover:bg-brand-off-white/60 transition-colors ${resultColor}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="hidden sm:block text-xs text-brand-night-navy/50 mb-1">
                          {m.datum.toLocaleDateString("de-DE", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                            year: "2-digit"
                          })}
                        </div>
                        <div className="font-semibold text-sm text-brand-night-navy truncate">
                          {/* Mobile: abgekürzte Vereinsnamen, Desktop: volle. */}
                          <span className="sm:hidden">
                            {abbreviateTeamName(m.heimName)}
                          </span>
                          <span className="hidden sm:inline">{m.heimName}</span>
                          <span className="font-mono text-accent mx-2">
                            {m.ergebnisHeim ?? "—"}:{m.ergebnisGast ?? "—"}
                          </span>
                          <span className="sm:hidden">
                            {abbreviateTeamName(m.gastName)}
                          </span>
                          <span className="hidden sm:inline">{m.gastName}</span>
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
        <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
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
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Saison-Endstand {saison}
          </h3>
          <div className="mt-2 text-xs md:text-sm text-brand-night-navy/70 space-y-1">
            {result.finalPosition && (
              <div className="flex items-center gap-1.5">
                <Medal className="h-4 w-4 shrink-0 text-brand-night-navy/40" aria-hidden />
                <span>
                  Endplatz: <strong>{result.finalPosition}</strong>
                  {result.teamsInLeague && ` von ${result.teamsInLeague}`}
                </span>
              </div>
            )}
            {result.promoted && (
              <div className="flex items-center gap-1.5">
                <ArrowUp className="h-4 w-4 shrink-0 text-accent-dark" aria-hidden />
                <span>Aufstieg geschafft</span>
              </div>
            )}
            {result.relegated && (
              <div className="flex items-center gap-1.5">
                <ArrowDown className="h-4 w-4 shrink-0 text-brand-alert-red" aria-hidden />
                <span>Abgestiegen</span>
              </div>
            )}
            {result.cupRoundReached && (
              <div className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4 shrink-0 text-brand-night-navy/40" aria-hidden />
                <span>Pokal: {result.cupRoundReached}</span>
              </div>
            )}
            {result.customNotes && (
              <div className="flex items-center gap-1.5">
                <StickyNote className="h-4 w-4 shrink-0 text-brand-night-navy/40" aria-hidden />
                <span>{result.customNotes}</span>
              </div>
            )}
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
