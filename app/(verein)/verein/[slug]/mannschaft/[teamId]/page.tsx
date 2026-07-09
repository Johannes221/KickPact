import Link from "next/link";
import {
  Trophy,
  Medal,
  ArrowUp,
  ArrowDown,
  StickyNote,
  Sparkles,
  CalendarDays
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import {
  listMatchesForTeam,
  listAvailableSeasonsForTeam,
  getMatchChargesSummaryForTeam,
  getPreviousSeasonDisplay,
  type PreviousSeasonDisplay
} from "@/lib/db/queries/matches";
import { SeasonSwitcher } from "@/components/shared/season-switcher";
import { listClubSeasonPledges } from "@/lib/db/queries/club-dashboard";
import { getTeamPrognose } from "@/lib/db/queries/simulation";
import { computeTeamSeasonStats } from "@/lib/db/queries/team-dashboard";
import {
  getFullTeamInClub,
  resolveSeasonResultTarget
} from "@/lib/db/queries/team-lifecycle";
import { saisonLabel } from "@/lib/utils/saison";
import { getClubById } from "@/lib/db/queries/club-admin";
import { getWrappedEntryInfo } from "@/lib/db/queries/wrapped";
import { getPendingTransferRequestForTeam } from "@/lib/db/queries/license-transfers";
import { countPledgesForTeam } from "@/lib/db/queries/pledges";
import { getTeamLicensePlanDirect } from "@/lib/db/queries/subscriptions";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { inngest } from "@/lib/inngest/client";
import { isTeamCrawling } from "@/lib/crawler/crawl-status";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import { markCrawlStarted } from "@/lib/db/queries/crawler";
import { TeamSetupChecklist } from "./_components/team-setup-checklist";
import { CrawlAutoRefresh } from "./_components/crawl-auto-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { eur } from "@/lib/utils/currency";

export const metadata = { title: "Mannschaft · KickPact" };

export default async function TeamDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; teamId: string }>;
  searchParams: Promise<{ saison?: string }>;
}) {
  const { slug, teamId } = await params;
  const { saison: saisonParam } = await searchParams;
  const { club, user } = await assertTeamPageAccess(slug, teamId, "viewer");

  const team = await getFullTeamInClub(teamId, club.id);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  // Paket B (Spec §1.5): Banner für offene Lizenz-Transfer-Anfrage.
  const pendingTransfer = await getPendingTransferRequestForTeam(team.id);

  // W1.3 Saison-Switcher: die ANZEIGE-Saison der Spiele-Liste (?saison=…) —
  // Default team.saison; nur Saisons mit Spielen (∪ aktuelle) sind wählbar.
  // Charges/Stats bleiben bewusst an der aktuellen Saison.
  const availableSeasons = await listAvailableSeasonsForTeam(team.id);
  const selectedSaison =
    saisonParam && availableSeasons.includes(saisonParam)
      ? saisonParam
      : team.saison;
  const isCurrentSeasonView = selectedSaison === team.saison;
  // Jüngste verfügbare Saison VOR der aktuellen (für den EmptyState-Sprung).
  const previousSeasonView =
    availableSeasons.find((s) => s < team.saison) ?? null;

  const [
    matchRows,
    chargesSummary,
    seasonTarget,
    seasonPledges,
    previousSeason,
    prognose,
    wrappedEntry
  ] =
    await Promise.all([
      listMatchesForTeam(team.id, 30, { saison: selectedSaison }),
      getMatchChargesSummaryForTeam(team.id),
      // B8 (Audit 2026-06-11): welche Saison der Endstand-Block bedient,
      // entscheidet der Resolver — nach dem Saison-Bump (Juli) gehört das
      // offene Ergebnis zur VORSAISON („Saison-Endstand 25/26" statt
      // „26/27 läuft noch").
      resolveSeasonResultTarget(team.id, team.saison),
      listClubSeasonPledges(club.id).then((rows) => rows.filter((r) => r.teamId === team.id)),
      // „Letzte Saison"-Block: nur befüllt, solange die aktuelle Saison < 3
      // gespielte Spiele hat UND Vorsaison-Historie (Backfill) existiert.
      getPreviousSeasonDisplay(team.id),
      // W3: „Prognose"-Karte (Rückblick aktiver Pacts + Hochrechnung).
      getTeamPrognose(team.id),
      // Wrapped-Karte (W4): Vorsaison >= 3 Spiele UND aktuelle Saison < 5.
      getWrappedEntryInfo(team.id)
    ]);

  // Saison-Stats aus echten Matches berechnen
  const { games, wins, draws, losses, goalsFor, goalsAgainst } =
    await computeTeamSeasonStats(team.id, team.name, club.name);
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

  // Saison "2526" → lesbar "25/26" (B8: zentraler Helper statt Inline-Slice).
  const saisonDisplay = saisonLabel(team.saison);

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
      hint: "IBAN + Absenderdaten für die Zahlungsübersichten eintragen.",
      href: `${teamBase}/einstellungen#zahlungsdaten`
    },
    {
      done: !!team.logoUrl,
      label: "Logo hinzufügen",
      hint: "Euer Wappen erscheint auf dem öffentlichen Profil.",
      href: `${teamBase}/profil#logo`
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
  // (W1.3: nur in der AKTUELLEN Saison-Ansicht — eine leere historische
  // Anzeige-Saison soll keinen Crawl auslösen.)
  // `team.isActive`: für ein deaktiviertes Team überspringt der Crawler jede
  // Arbeit (crawl-matches filtert isActive) → crawlCompletedAt würde nie gesetzt
  // → Dauer-Banner „Spiele werden geladen". Deaktivierte Teams also gar nicht
  // erst on-demand crawlen.
  if (
    matchRows.length === 0 &&
    team.fussballdeTeamId &&
    team.isActive &&
    !isCrawling &&
    isCurrentSeasonView
  ) {
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
        subtitle={`${club.name} · Saison ${saisonDisplay}`}
      />

      {/* Paket B (Spec §1.5): offene Lizenz-Transfer-Anfrage eines Vereins */}
      {pendingTransfer && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
          <p className="text-sm font-semibold text-brand-night-navy">
            {pendingTransfer.toClubName} möchte deine Mannschaft unter die
            Vereinslizenz nehmen.
          </p>
          {pendingTransfer.fromUserId === user.id ? (
            <p className="mt-1 text-sm text-brand-night-navy/70">
              Du entscheidest: Annehmen, Co-Verwaltung oder Ablehnen —{" "}
              <Link href="/konto" className="font-semibold text-accent">
                jetzt in „Mein Konto" entscheiden →
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-sm text-brand-night-navy/70">
              Der Lizenz-Inhaber der Mannschaft wurde benachrichtigt und
              entscheidet über die Anfrage.
            </p>
          )}
        </div>
      )}

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
            <div key={s.label} className="rounded-xl bg-white shadow-ios-card p-3">
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

      {/* W3: Prognose — was die aktiven Pacts letzte Saison gebracht hätten +
          Hochrechnung der laufenden Saison. Rendert nur mit Daten. */}
      {prognose && (
        <section
          aria-label="Prognose"
          className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5"
        >
          <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
            📈 Prognose
          </h3>
          <div className="mt-2 space-y-2">
            {prognose.lastSeason && (
              <p className="text-sm text-brand-night-navy/80 leading-snug">
                Letzte Saison ({prognose.prevSaisonLabel}) hätten eure aktuellen
                Pacts über {prognose.lastSeason.matchCount} Spiele{" "}
                <strong className="font-display text-lg text-accent">
                  {eur(prognose.lastSeason.totalCents)}
                </strong>{" "}
                eingebracht.
              </p>
            )}
            {prognose.onPace && (
              <p className="text-sm text-brand-night-navy/80 leading-snug">
                Auf diesem Kurs: ~
                <strong className="font-display text-lg text-brand-night-navy">
                  {eur(prognose.onPace.projectedCents)}
                </strong>{" "}
                bis Saisonende — nach {prognose.onPace.playedCount} von ~
                {prognose.onPace.expectedGames} Spielen sind{" "}
                {eur(prognose.onPace.currentCents)} zusammengekommen.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-brand-night-navy/50">
            Rückblick &amp; Hochrechnung auf Basis echter Spiele — eine Prognose,
            kein Versprechen.
          </p>
        </section>
      )}

      {/* Saison-Wetten dieser Mannschaft */}
      {seasonPledges.length > 0 && (
        <section>
          <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy mb-3">
            Saison-Ziele
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
                  className="rounded-xl bg-white shadow-ios-card p-3 flex items-center gap-3"
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

      {/* Saison-Endstand: read-only Block, Bearbeitung in Einstellungen/Saison.
          Spiegelt die Resolver-Saison (B8): im Juli die noch offene Vorsaison. */}
      <SeasonStatusBlock
        slug={slug}
        teamId={team.id}
        saison={seasonTarget.saison}
        isCurrentSeason={seasonTarget.saison === team.saison}
        result={seasonTarget.result ?? null}
      />

      {/* Saison-Wrapped (W4): Story-Rückblick der Vorsaison — nur solange die
          neue Saison noch jung ist (<5 Spiele) und Vorsaison-Daten existieren. */}
      {wrappedEntry && (
        <section
          aria-label="Saison-Wrapped"
          className="rounded-2xl bg-brand-night-navy p-4 md:p-5 shadow-ios-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-[#A3E635]">
                <Sparkles className="h-[1.15rem] w-[1.15rem]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-white">
                  ✨ Euer Saison-Rückblick {saisonLabel(wrappedEntry.prevSaison)} ist da
                </h3>
                <p className="text-xs md:text-sm text-white/70">
                  Tore, Comebacks, Knipser — eure Saison als durchswipebare Story.
                </p>
              </div>
            </div>
            <Link
              href={`${teamBase}/wrapped`}
              className="text-xs md:text-sm font-semibold text-[#A3E635] hover:underline shrink-0"
            >
              Story ansehen →
            </Link>
          </div>
        </section>
      )}

      {/* Spiele */}
      <section id="spiele">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
            Alle Spiele
          </h3>
          <span className="text-xs text-brand-night-navy/50">
            {matchRows.length} Spiel{matchRows.length === 1 ? "" : "e"}
          </span>
        </div>

        {/* W1.3: Saison-Switcher — nur Anzeige der Liste, Stats/Beiträge oben
            bleiben an der aktuellen Saison. */}
        <SeasonSwitcher
          className="mb-4"
          seasons={availableSeasons}
          current={selectedSaison}
          hrefFor={(s) =>
            s === team.saison ? `${teamBase}#spiele` : `${teamBase}?saison=${s}#spiele`
          }
        />

        {/* Crawl-Banner: erscheint solange der Job läuft — auch wenn schon
            Spiele geladen sind. Neue Spiele tauchen per Auto-Refresh nach und
            nach darunter auf. NUR in der aktuellen Saison-Ansicht: in der
            historischen 25/26-Ansicht (Switcher) ändert sich nichts mehr, das
            „werden geladen"-Banner wäre dort faktisch falsch (QA 2026-06-12). */}
        {isCrawling && isCurrentSeasonView && (
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

        {/* Unsichtbarer Poller (nur aktiv während des Crawls, nur in der
            aktuellen Saison-Ansicht — die Historie ändert sich nicht). */}
        <CrawlAutoRefresh
          teamId={team.id}
          isCrawling={isCrawling && isCurrentSeasonView}
          matchCount={matchRows.length}
        />

        {matchRows.length === 0 ? (
          !isCrawling && (
            <EmptyState
              icon={CalendarDays}
              title="Noch keine Spiele"
              description={
                team.dataCoverage === "none"
                  ? // B1c (Audit 2026-06-11): keine Automatik versprechen, wenn es
                    // für diese Altersklasse keine automatischen Spieldaten gibt.
                    "Für diese Altersklasse gibt es keine automatischen Spieldaten. Spiele und Ereignisse meldet ihr selbst — eure Sponsoren bestätigen sie anschließend."
                  : "Für diese Mannschaft wurden noch keine Spiele gefunden. Sobald die Saison startet, erscheinen sie hier automatisch."
              }
              action={
                <div className="flex flex-col items-center gap-3">
                  <Button asChild>
                    <Link href={`${teamBase}/sponsoren`}>Sponsoren einladen</Link>
                  </Button>
                  {/* W1.3: leere aktuelle Saison → Sprung in die Vorsaison-Ansicht. */}
                  {isCurrentSeasonView && previousSeasonView && (
                    <Link
                      href={`${teamBase}?saison=${previousSeasonView}#spiele`}
                      className="text-sm font-semibold text-accent hover:underline"
                    >
                      Saison {saisonLabel(previousSeasonView)} ansehen →
                    </Link>
                  )}
                </div>
              }
            />
          )
        ) : (
          <ul className="space-y-2">
            {matchRows.map((m) => {
              const isHeim = m.ownSide === "heim";
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
                        {/* Score-Zeile: Heim (gekürzt/rechtsbündig) — Ergebnis
                            (fix mittig, tabular-nums) — Gast (gekürzt/linksbündig).
                            Lange Vereinsnamen werden gekürzt + truncate, das
                            Ergebnis bleibt in seiner festen Spalte sichtbar. */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold text-brand-night-navy">
                          <span className="min-w-0 truncate text-right" title={m.heimName}>
                            {abbreviateTeamName(m.heimName)}
                          </span>
                          <span className="font-mono tabular-nums text-accent whitespace-nowrap">
                            {m.ergebnisHeim ?? "—"}:{m.ergebnisGast ?? "—"}
                          </span>
                          <span className="min-w-0 truncate text-left" title={m.gastName}>
                            {abbreviateTeamName(m.gastName)}
                          </span>
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

      {/* Letzte Saison (Phase 3, jetzt Teaser): Bilanz der Vorsaison — nur
          solange die aktuelle Saison noch (fast) leer ist. Die Vollanzeige der
          Spiele übernimmt der Saison-Switcher (W1.3), der Block verlinkt nur
          noch dorthin. Nur in der aktuellen Saison-Ansicht (sonst zeigt die
          Liste oben bereits die Vorsaison). */}
      {previousSeason && isCurrentSeasonView && (
        <PreviousSeasonSection
          data={previousSeason}
          switcherHref={`${teamBase}?saison=${previousSeason.prevSaison}#spiele`}
        />
      )}
    </div>
  );
}

function PreviousSeasonSection({
  data,
  switcherHref
}: {
  data: PreviousSeasonDisplay;
  /** Sprung in die Vorsaison-Ansicht der Spiele-Liste (Saison-Switcher). */
  switcherHref: string;
}) {
  const { record } = data;
  return (
    <section aria-label={`Letzte Saison ${data.prevSaisonLabel}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
          Letzte Saison ({data.prevSaisonLabel})
        </h3>
        <span className="text-xs text-brand-night-navy/50">
          {record.spiele} Spiel{record.spiele === 1 ? "" : "e"}
        </span>
      </div>

      {/* Bilanz-Zeile im Stil der Saison-Stats-Kacheln */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[
          { label: "Bilanz (S/U/N)", value: `${record.siege}/${record.unentschieden}/${record.niederlagen}` },
          { label: "Tore", value: `${record.torePlus}:${record.toreMinus}` },
          { label: "Spiele", value: record.spiele }
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white shadow-ios-card p-3">
            <div className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
              {s.label}
            </div>
            <div className="font-display font-bold text-xl tracking-tight mt-1 text-brand-night-navy">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* W1.3: Vollanzeige der Vorsaison-Spiele übernimmt der Saison-Switcher. */}
      <Link
        href={switcherHref}
        className="inline-flex items-center text-sm font-semibold text-accent hover:underline"
      >
        Alle Spiele {data.prevSaisonLabel} ansehen →
      </Link>
    </section>
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
  isCurrentSeason,
  result
}: {
  slug: string;
  teamId: string;
  /** Saison-Code aus resolveSeasonResultTarget — kann die Vorsaison sein. */
  saison: string;
  /** false = Block bedient die noch offene VORSAISON (Juli-Fenster). */
  isCurrentSeason: boolean;
  result: SeasonStatusResult | null;
}) {
  const settingsHref = `/verein/${slug}/mannschaft/${teamId}/einstellungen/saison`;
  const label = saisonLabel(saison);

  if (!result) {
    return (
      <section
        aria-label={`Saison-Endstand ${label}`}
        className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 md:p-5"
      >
        <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
          Saison-Endstand {label}
        </h3>
        <p className="mt-1 text-xs md:text-sm text-brand-night-navy/70">
          {isCurrentSeason
            ? "Saison läuft noch — Endstand wird am Saisonende automatisch übernommen."
            : `Die Saison ${label} ist vorbei — der Endstand wird automatisch übernommen, sobald die Daten vorliegen.`}{" "}
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
      aria-label={`Saison-Endstand ${label}`}
      className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Saison-Endstand {label}
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
