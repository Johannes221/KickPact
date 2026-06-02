import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import {
  Banknote,
  Handshake,
  Coins,
  Gauge,
  Sparkles,
  Compass,
  HandCoins
} from "lucide-react";
import { DashboardTile } from "@/components/shared/dashboard-tile";
import { getCapUsageForActivePledges } from "@/lib/db/queries/sponsor-reporting";
import {
  findSponsorForUser,
  getSponsorDashboardKpis
} from "@/lib/db/queries/sponsor-dashboard";
import { ReferralShareCard } from "@/components/sponsor/referral-share-card";
import { buildReferralShareUrl } from "@/lib/referral/link";

export const metadata = { title: "Sponsor · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

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
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Bereit, Mannschaften zu sponsern?
        </h1>
        <p className="text-sm text-brand-night-navy/60">
          Öffne den Einladungslink, den dir eine Mannschaft geschickt hat — oder entdecke
          Mannschaften, die nach Sponsoren suchen.
        </p>
        <Link
          href="/sponsor/discover"
          className="inline-block rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Mannschaften entdecken →
        </Link>
      </div>
    );
  }

  const now = new Date();
  const [kpis, capUsageRows] = await Promise.all([
    getSponsorDashboardKpis(sponsorRow.id, now),
    // Cap-Auslastung: pro aktivem Pledge im aktuellen Monat
    getCapUsageForActivePledges(sponsorRow.id, now)
  ]);
  const { activePledgeCount, monthlyCents, biggestRecent, ytdCents, lastYearCents } =
    kpis;

  // Pledge mit höchster Cap-Auslastung (nur capped) — kann undefined sein
  const topCapPledge = capUsageRows.find((p) => p.percentage !== null);

  const referralUrl = buildReferralShareUrl(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.schartl.dev",
    sponsorRow.id
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
          Sponsor
        </p>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy break-words">
          {sponsorRow.displayName}
        </h1>
      </div>

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

        <DashboardTile
          icon={Handshake}
          title="Meine Pacts"
          primary={String(activePledgeCount)}
          secondary={
            activePledgeCount === 0
              ? "Noch keine aktiven Pacts"
              : "Tippen für Übersicht"
          }
          href="/sponsor/pledge"
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
            percentage={topCapPledge.percentage ?? 0}
          />
        )}

        {biggestRecent && biggestRecent.amountCents > 0 && (
          <DashboardTile
            icon={Sparkles}
            title="Geilster Moment"
            primary={eur(biggestRecent.amountCents)}
            secondary={`Trigger: ${biggestRecent.triggerType}`}
            className="md:col-span-2"
          />
        )}

        <DashboardTile
          icon={Compass}
          title="Neue Mannschaft entdecken"
          primary="Mannschaften finden"
          secondary="Lokale Vereine, die offen sind für Sponsoren"
          href="/sponsor/discover"
          variant="cta"
          className="md:col-span-2"
        />
      </div>

      <ReferralShareCard shareUrl={referralUrl} />
    </div>
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
  percentage
}: {
  teamName: string;
  clubName: string;
  chargedCents: number;
  capCents: number;
  percentage: number;
}) {
  const pct = Math.round(percentage * 100);
  const barCls = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent";
  const labelCls = pct >= 90 ? "text-red-600" : "text-brand-night-navy/60";
  return (
    <DashboardTile
      icon={Gauge}
      title="Cap-Auslastung"
      primary={`${pct}%`}
      secondary={`${eur(chargedCents)} / ${eur(capCents)}`}
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
      </div>
    </DashboardTile>
  );
}
