import Link from "next/link";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { getVereinDashboardKpis } from "@/lib/db/queries/club-reporting";
import {
  TrendingUp,
  Users,
  HandCoins,
  Receipt,
  Share2,
  ArrowRight,
  BadgeCheck,
  Send,
  type LucideIcon
} from "lucide-react";
import { DashboardTile } from "@/components/shared/dashboard-tile";
import { PageHeader } from "@/components/shared/page-header";
import { eur } from "@/lib/utils/currency";

export const metadata = { title: "Dashboard · KickPact" };

export default async function VereinDashboard({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const showSubscribedBanner = sp.subscribed === "1";
  const { club } = await assertVereinAdminOrRedirect(slug, "viewer");

  const {
    teamRows,
    activePledgeCount,
    weeklyChargeCents,
    monthlyChargeCents,
    recentMatchCount,
    sponsorCount,
    verifiedAt
  } = await getVereinDashboardKpis(club.id, new Date());

  const teamCount = teamRows.length;

  return (
    <div className="space-y-4">
      {/* Mobile-Titel: auf Desktop liefert das Header-Shell bereits den großen
          Vereinsnamen, daher hier nur md:hidden (kein Doppel-Titel). Das Zahnrad
          liegt jetzt durchgängig in der AppNavBar. */}
      <PageHeader
        className="md:hidden"
        title={club.name}
        subtitle="Vereins-Dashboard"
      />
      {showSubscribedBanner && (
        <div
          role="alert"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          Abonnement aktiviert — du bist jetzt dabei! Dein Abo wird in wenigen
          Sekunden aktiviert. Seite neu laden falls der Status noch nicht
          aktuell ist.
        </div>
      )}

      <NextSteps
        slug={slug}
        verified={verifiedAt !== null}
        teamCount={teamCount}
        sponsorCount={sponsorCount}
        activePledgeCount={activePledgeCount}
      />

    <div className="grid gap-3 md:gap-4 md:grid-cols-2">
      <DashboardTile
        icon={TrendingUp}
        title="Diese Woche"
        primary={eur(weeklyChargeCents)}
        secondary={`${recentMatchCount} Spiel${recentMatchCount === 1 ? "" : "e"} · ${eur(monthlyChargeCents)} diesen Monat`}
        href={`/verein/${slug}/abrechnungen`}
      />

      <DashboardTile
        icon={Users}
        title="Mannschaften"
        primary={String(teamCount)}
        secondary={
          teamCount === 0
            ? "Noch keine Mannschaft angelegt"
            : teamRows
                .slice(0, 3)
                .map((t) => t.name)
                .join(" · ") + (teamCount > 3 ? ` · +${teamCount - 3}` : "")
        }
        href={`/verein/${slug}/mannschaften`}
      />

      <DashboardTile
        icon={HandCoins}
        title="Aktive Sponsoren"
        primary={String(activePledgeCount)}
        secondary={
          activePledgeCount === 0
            ? "Noch keine Pacts aktiv"
            : "Tippen für die volle Sponsoren-Liste"
        }
        href={`/verein/${slug}/sponsoren`}
      />

      <DashboardTile
        icon={Receipt}
        title="Letzte Abrechnungen"
        primary={eur(monthlyChargeCents)}
        secondary="Diesen Monat erfasst"
        href={`/verein/${slug}/abrechnungen`}
      />

      <DashboardTile
        icon={Share2}
        title="Einladungslink teilen"
        primary="Sponsoren werben"
        secondary="WhatsApp · Mail · Stammtisch — Sponsoren legen Pacts selbst fest"
        href={`/verein/${slug}/sponsoren`}
        variant="cta"
        className="md:col-span-2"
      />
    </div>
    </div>
  );
}

/**
 * „Nächste Schritte" — analog zur Sponsor-Startseite: dynamische, kontextuelle
 * Handlungs-Vorschläge für den Verein. Nur sichtbar, solange mindestens ein
 * Schritt relevant ist (Verifikation offen, keine Mannschaft, keine Sponsoren,
 * noch kein aktiver Pact).
 */
function NextSteps({
  slug,
  verified,
  teamCount,
  sponsorCount,
  activePledgeCount
}: {
  slug: string;
  verified: boolean;
  teamCount: number;
  sponsorCount: number;
  activePledgeCount: number;
}) {
  type Step = {
    icon: LucideIcon;
    label: string;
    desc: string;
    href: string;
    urgent?: boolean;
  };

  const steps: Step[] = [];

  if (!verified) {
    steps.push({
      icon: BadgeCheck,
      label: "Verein verifizieren",
      desc: "Kurz bestätigen, dass du für den Verein sprichst. Erst danach gehen Zahlungsübersichten an Sponsoren raus.",
      href: `/verein/${slug}/verifikation`,
      urgent: true
    });
  }

  if (teamCount === 0) {
    steps.push({
      icon: Users,
      label: "Erste Mannschaft anlegen",
      desc: "Verbinde eine Mannschaft — Spiele und Ereignisse laufen dann automatisch ein.",
      href: `/verein/${slug}/mannschaften/neu`,
      urgent: verified
    });
  } else if (sponsorCount === 0) {
    steps.push({
      icon: Send,
      label: "Sponsoren einladen",
      desc: "Teile deinen Einladungslink — Familie, Freunde, Oma, Onkel. Sponsoren legen ihre Pacts selbst fest.",
      href: `/verein/${slug}/sponsoren`
    });
  } else if (activePledgeCount === 0) {
    steps.push({
      icon: HandCoins,
      label: "Noch kein aktiver Pact",
      desc: "Deine Sponsoren haben noch keinen Pact eingerichtet — stups sie ruhig noch einmal an.",
      href: `/verein/${slug}/sponsoren`
    });
  }

  if (steps.length === 0) return null;

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
                  (s.urgent ? "bg-accent text-white" : "bg-accent/10 text-accent-dark")
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
