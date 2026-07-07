import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import {
  Banknote,
  CalendarClock,
  Coins,
  Gauge,
  Sparkles,
  Compass,
  HandCoins,
  Handshake,
  Inbox,
  Send,
  ArrowRight,
  type LucideIcon
} from "lucide-react";
import { DashboardTile } from "@/components/shared/dashboard-tile";
import { getCapUsageForActivePledges } from "@/lib/db/queries/sponsor-reporting";
import type { SponsorBillingCycle } from "@/lib/db/schema/sponsors";
import {
  findSponsorForUser,
  getSponsorDashboardKpis,
  getSponsoredTeamMatches
} from "@/lib/db/queries/sponsor-dashboard";
import { listPledgesForSponsor } from "@/lib/db/queries/pledges";
import { countPendingForSponsor } from "@/lib/db/queries/approvals";
import { listInquiriesForSponsor } from "@/lib/db/queries/sponsor-discover";
import { triggerLabel } from "@/lib/triggers/labels";
import { SponsoredMatches } from "./_components/sponsored-matches";
import { ReferralShareCard } from "@/components/sponsor/referral-share-card";
import { buildReferralShareUrl } from "@/lib/referral/link";
import { PageHeader } from "@/components/shared/page-header";
import { eur } from "@/lib/utils/currency";

export const metadata = { title: "Sponsor · KickPact" };

export default async function SponsorDashboard() {
  const user = await requireUser();

  const sponsorRow = await findSponsorForUser(user.id);

  // Empty state: no sponsor profile yet
  if (!sponsorRow) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent/10 text-accent-dark">
          <HandCoins className="h-8 w-8" aria-hidden />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-brand-night-navy">
          Bereit, Mannschaften zu sponsern?
        </h1>
        <p className="text-sm text-brand-night-navy/60">
          Öffne den Einladungslink, den dir eine Mannschaft geschickt hat — oder entdecke
          Mannschaften, die nach Sponsoren suchen.
        </p>
        <Button asChild variant="accent">
          <Link href="/sponsor/discover">Mannschaften entdecken →</Link>
        </Button>
      </div>
    );
  }

  const now = new Date();
  const [kpis, capUsageRows, myPledges, pendingCount, inquiries, sponsoredMatches] =
    await Promise.all([
      getSponsorDashboardKpis(sponsorRow.id, now),
      // Cap-Auslastung: pro aktivem Pact im aktuellen Monat
      getCapUsageForActivePledges(sponsorRow.id, now),
      listPledgesForSponsor(sponsorRow.id),
      countPendingForSponsor(user.id),
      listInquiriesForSponsor(user.id),
      // Spiele-Überblick: letztes + nächstes Spiel je gesponserter Mannschaft
      getSponsoredTeamMatches(sponsorRow.id, now)
    ]);
  const { activePledgeCount, monthlyCents, biggestRecent, ytdCents, lastYearCents } =
    kpis;

  // Pact mit höchster Cap-Auslastung (nur capped) — kann undefined sein
  const topCapPledge = capUsageRows.find((p) => p.percentage !== null);

  // „Meine Pacts"-Sektion: laufende Pacts (aktiv + pausiert), beendete fallen raus.
  const livePacts = myPledges.filter(
    (p) => p.status === "active" || p.status === "paused"
  );
  // Offene Anfragen (warten auf Antwort der Mannschaft).
  const openInquiryCount = inquiries.filter((i) => i.status === "pending").length;
  // Angenommene Anfragen mit gültigem Token, aber noch ohne aktiven Pact →
  // hier fehlt nur noch der „Sponsoring aktivieren"-Schritt des Sponsors.
  const acceptedAwaitingPledge = inquiries.filter(
    (i) => i.status === "accepted" && i.inviteToken && !i.hasActivePledge
  );
  const acceptedAwaitingCount = acceptedAwaitingPledge.length;
  // Bei genau einer angenommenen Anfrage direkt in den Pledge-Builder springen,
  // sonst auf die Mannschaften-Liste (dort steht je Team ein „Pact einrichten").
  const setupPledgeHref =
    acceptedAwaitingCount === 1 && acceptedAwaitingPledge[0].inviteToken
      ? `/sponsor/pledge/new?invitation=${acceptedAwaitingPledge[0].inviteToken}`
      : "/sponsor/mannschaften";

  const referralUrl = buildReferralShareUrl(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.schartl.dev"
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Mobile: eigener Content-Titel (AppNavBar zeigt nur den kurzen
          Sektions-Titel). Desktop liefert den großen Namen unten. */}
      <PageHeader
        className="md:hidden"
        title="Übersicht"
        subtitle={sponsorRow.displayName}
      />
      <div className="hidden md:block">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/60 mb-1">
          Sponsor
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-brand-night-navy break-words">
          {sponsorRow.displayName}
        </h1>
      </div>

      {/* Paket A.5 (Spec §1.2): Hinweis nur bei Saisonende-Abrechnung */}
      {sponsorRow.billingCycle === "season_end" && (
        <Link
          href="/sponsor/profil"
          className="flex items-center gap-2.5 rounded-xl bg-accent/10 px-4 py-2.5 text-xs font-medium text-brand-night-navy/80"
        >
          <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-accent-dark" />
          <span>
            Deine Beiträge werden am <strong>Saisonende</strong> abgerechnet —
            eine Zahlungsübersicht am 30.06.
          </span>
        </Link>
      )}

      <NextSteps
        activePledgeCount={activePledgeCount}
        pendingCount={pendingCount}
        openInquiryCount={openInquiryCount}
        acceptedAwaitingCount={acceptedAwaitingCount}
        setupPledgeHref={setupPledgeHref}
      />

      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <DashboardTile
          icon={Banknote}
          title="Diesen Monat"
          primary={eur(monthlyCents)}
          secondary={
            monthlyCents === 0
              ? "Noch keine Spielereignisse erfasst"
              : "Summe aller Spielereignisse"
          }
          href="/sponsor/rechnungen"
        />

        <YearTotalTile
          ytdCents={ytdCents}
          lastYearCents={lastYearCents}
        />

        {topCapPledge && (
          <CapUsageTile
            teamName={topCapPledge.teamName}
            clubName={topCapPledge.clubName}
            chargedCents={topCapPledge.chargedThisMonthCents}
            capCents={topCapPledge.monthlyCapCents ?? 0}
            pendingCents={topCapPledge.pendingThisMonthCents}
            percentage={topCapPledge.percentage ?? 0}
            billingCycle={topCapPledge.billingCycle}
            seasonToDateCents={topCapPledge.seasonToDateCents}
          />
        )}

        {biggestRecent && biggestRecent.amountCents > 0 && (
          <DashboardTile
            icon={Sparkles}
            title="Geilster Moment"
            primary={eur(biggestRecent.amountCents)}
            secondary={triggerLabel(biggestRecent.triggerType)}
            className={topCapPledge ? "md:col-span-2" : undefined}
          />
        )}
      </div>

      <MyPactsSection pacts={livePacts} totalActive={activePledgeCount} />

      <SponsoredMatches teams={sponsoredMatches} />

      <ReferralShareCard shareUrl={referralUrl} />
    </div>
  );
}

/**
 * „Nächste Schritte" — kontextuelle Handlungs-Vorschläge. Dringende Punkte
 * (Events warten auf Bestätigung) zuerst und in Akzentfarbe; Entdecken ist
 * immer dabei, mit angepasster Copy, wenn es noch keinen Pact gibt.
 */
function NextSteps({
  activePledgeCount,
  pendingCount,
  openInquiryCount,
  acceptedAwaitingCount,
  setupPledgeHref
}: {
  activePledgeCount: number;
  pendingCount: number;
  openInquiryCount: number;
  /** Angenommene Anfragen, bei denen nur noch der Pact einzurichten ist. */
  acceptedAwaitingCount: number;
  /** Ziel des „Pact einrichten"-Schritts (Token-Direktlink oder Mannschaften). */
  setupPledgeHref: string;
}) {
  type Step = {
    icon: LucideIcon;
    label: string;
    desc: string;
    href: string;
    urgent?: boolean;
  };

  const steps: Step[] = [];

  if (pendingCount > 0) {
    steps.push({
      icon: Inbox,
      label: `${pendingCount} ${pendingCount === 1 ? "Event" : "Events"} bestätigen`,
      desc: "Ein Verein hat ein Spezial-Event gemeldet — bestätige es, damit der Beitrag zählt.",
      href: "/sponsor/inbox",
      urgent: true
    });
  }

  // Angenommene Anfrage(n) ohne Pact: der konkrete nächste Schritt — der Verein
  // hat zugesagt, jetzt fehlt nur noch das Einrichten. Ersetzt das frühere
  // generische „Erste Mannschaft finden", sobald eine Mannschaft zugesagt hat.
  if (acceptedAwaitingCount > 0) {
    steps.push({
      icon: Handshake,
      label:
        acceptedAwaitingCount === 1
          ? "Pact für deine Mannschaft einrichten"
          : `${acceptedAwaitingCount} Pacts einrichten`,
      desc:
        acceptedAwaitingCount === 1
          ? "Eine Mannschaft hat deine Anfrage angenommen — richte jetzt dein Sponsoring ein."
          : "Diese Mannschaften haben angenommen — richte jeweils dein Sponsoring ein.",
      href: setupPledgeHref,
      urgent: true
    });
  }

  if (openInquiryCount > 0) {
    steps.push({
      icon: Send,
      label: `${openInquiryCount} offene ${openInquiryCount === 1 ? "Anfrage" : "Anfragen"}`,
      desc: "Du wartest auf Rückmeldung von Mannschaften, die du angefragt hast.",
      href: "/sponsor/discover"
    });
  }

  // „Erste Mannschaft finden" nur, wenn es noch gar kein Engagement gibt
  // (kein aktiver Pact, keine angenommene/offene Anfrage). Sonst „entdecken".
  const hasEngagement =
    activePledgeCount > 0 || acceptedAwaitingCount > 0 || openInquiryCount > 0;

  steps.push({
    icon: Compass,
    label: hasEngagement ? "Neue Mannschaft entdecken" : "Erste Mannschaft finden",
    desc: hasEngagement
      ? "Lokale Vereine, die offen für Sponsoren sind."
      : "Lokale Vereine, die offen für Sponsoren sind — leg deinen ersten Pact an.",
    href: "/sponsor/discover"
  });

  return (
    <section className="rounded-2xl bg-ios-card shadow-ios-card p-4 md:p-5">
      <h2 className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-night-navy/50 mb-3">
        Nächste Schritte
      </h2>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="press group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-brand-off-white/70"
            >
              <span
                className={
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full " +
                  (s.urgent
                    ? "bg-accent text-white"
                    : "bg-accent/10 text-accent-dark")
                }
                aria-hidden
              >
                <s.icon className="h-[1.15rem] w-[1.15rem]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-brand-night-navy">
                  {s.label}
                </div>
                <div className="text-xs text-brand-night-navy/60 leading-snug">
                  {s.desc}
                </div>
              </div>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-brand-night-navy/30 transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * „Meine Pacts" — laufende Pacts (aktiv/pausiert) mit Mannschaft + Verein.
 * Zeigt max. 4 Stück direkt; der Rest hängt am „Alle ansehen"-Link.
 */
function MyPactsSection({
  pacts,
  totalActive
}: {
  pacts: Array<{
    id: string;
    status: string;
    sommerpausePaused: boolean;
    teamName: string;
    clubName: string;
    monthlyCapCents: number | null;
  }>;
  totalActive: number;
}) {
  const shown = pacts.slice(0, 4);
  const rest = pacts.length - shown.length;

  return (
    <section className="rounded-2xl bg-ios-card shadow-ios-card p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-night-navy/50">
          Meine Pacts{totalActive > 0 ? ` · ${totalActive} aktiv` : ""}
        </h2>
        {pacts.length > 0 && (
          <Link
            href="/sponsor/pledge"
            className="text-xs font-semibold text-accent inline-flex items-center gap-1 hover:underline"
          >
            Alle ansehen
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>

      {pacts.length === 0 ? (
        <div className="rounded-xl bg-brand-off-white p-5 text-center">
          <p className="text-sm font-semibold text-brand-night-navy">
            Noch keine aktiven Pacts.
          </p>
          <p className="mt-1 text-xs text-brand-night-navy/60">
            Entdecke eine Mannschaft und richte deinen ersten Pact ein.
          </p>
          <Button asChild variant="accent" size="sm" className="mt-3">
            <Link href="/sponsor/discover">
              Mannschaften entdecken
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => (
            <li key={p.id}>
              <Link
                href={`/sponsor/pledge/${p.id}`}
                className="press flex items-center justify-between gap-3 rounded-xl bg-brand-off-white/60 p-3 transition-colors hover:bg-brand-off-white"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-brand-night-navy truncate">
                    {p.teamName}
                  </div>
                  <div className="text-xs text-brand-night-navy/50 truncate">
                    {p.clubName}
                    {p.monthlyCapCents
                      ? ` · Cap ${eur(p.monthlyCapCents)}/Monat`
                      : ""}
                  </div>
                </div>
                <PactStatusBadge
                  status={p.status}
                  sommerpausePaused={p.sommerpausePaused}
                />
              </Link>
              {p.status === "paused" && p.sommerpausePaused && (
                <p className="mt-1 px-3 text-xs text-sky-800">
                  ☀️ Automatische Pause bis 1.8. — Spiele bis zum Saisonende
                  zählen weiterhin. Du musst nichts tun.
                </p>
              )}
            </li>
          ))}
          {rest > 0 && (
            <li className="pt-1 text-center text-xs text-brand-night-navy/50">
              + {rest} weitere
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function PactStatusBadge({
  status,
  sommerpausePaused = false
}: {
  status: string;
  sommerpausePaused?: boolean;
}) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800" },
    paused: { label: "Pausiert", cls: "bg-amber-100 text-amber-800" },
    ended: { label: "Beendet", cls: "bg-neutral-100 text-neutral-600" }
  };
  // A3: automatische Sommerpause klar benennen statt generisch „Pausiert".
  const entry =
    status === "paused" && sommerpausePaused
      ? { label: "Sommerpause", cls: "bg-sky-100 text-sky-800" }
      : (map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-600" });
  return (
    <span
      className={
        "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}

function YearTotalTile({
  ytdCents,
  lastYearCents
}: {
  ytdCents: number;
  lastYearCents: number;
}) {
  const hasLastYear = lastYearCents > 0;
  const deltaPct = hasLastYear
    ? Math.round(((ytdCents - lastYearCents) / lastYearCents) * 100)
    : null;
  const deltaLabel = deltaPct === null
    ? "Noch kein Vorjahres-Vergleich"
    : `${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs. Vorjahr (${eur(lastYearCents)})`;

  return (
    <DashboardTile
      icon={Coins}
      title="Jahres-Total"
      primary={eur(ytdCents)}
      secondary={deltaLabel}
      href="/sponsor/bilanz?range=this-year"
    />
  );
}

function CapUsageTile({
  teamName,
  clubName,
  chargedCents,
  capCents,
  pendingCents,
  percentage,
  billingCycle,
  seasonToDateCents
}: {
  teamName: string;
  clubName: string;
  chargedCents: number;
  capCents: number;
  pendingCents: number;
  percentage: number;
  billingCycle: SponsorBillingCycle;
  seasonToDateCents: number;
}) {
  const pct = Math.round(percentage * 100);
  const barCls = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent";
  const labelCls = pct >= 90 ? "text-red-600" : "text-brand-night-navy/60";
  const isSeasonEnd = billingCycle === "season_end";
  return (
    <DashboardTile
      icon={Gauge}
      title="Cap-Auslastung"
      primary={`${pct}%`}
      // Bei season_end deckelt der Cap nur pro Monat — deshalb explizit
      // „diesen Monat", damit die eine Saison-Rechnung nicht mit dem
      // Monatswert verwechselt wird.
      secondary={`${eur(chargedCents)} / ${eur(capCents)}${isSeasonEnd ? " diesen Monat" : ""}`}
      href="/sponsor/pledge"
    >
      <div className="space-y-1.5">
        <div className={`text-xs ${labelCls} truncate`}>
          {teamName} · {clubName}
        </div>
        <div className="h-2 w-full rounded-full bg-brand-neutral/20 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barCls}`}
            style={{ width: `${Math.min(100, pct)}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {pendingCents > 0 && (
          <div className="text-xs text-brand-night-navy/50">
            {eur(pendingCents)} ausstehend · zählt erst nach Bestätigung
          </div>
        )}
        {isSeasonEnd && (
          <div className="text-xs text-brand-night-navy/60">
            Saison bisher{" "}
            <span className="font-semibold text-brand-night-navy">
              {eur(seasonToDateCents)}
            </span>{" "}
            · sammelt sich auf eine Rechnung am Saisonende
          </div>
        )}
      </div>
    </DashboardTile>
  );
}
