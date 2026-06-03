import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { getVereinDashboardKpis } from "@/lib/db/queries/club-reporting";
import {
  TrendingUp,
  Users,
  HandCoins,
  Receipt,
  Share2,
  Goal,
  ChartColumnIncreasing,
  Gem,
  Settings
} from "lucide-react";
import { DashboardTile } from "@/components/shared/dashboard-tile";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsButton, type SettingsNavItem } from "@/components/shared/settings-button";

export const metadata = { title: "Dashboard · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

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
    recentMatchCount
  } = await getVereinDashboardKpis(club.id, new Date());

  const teamCount = teamRows.length;

  const base = `/verein/${slug}`;
  const clubSettings: SettingsNavItem[] = [
    { label: "Ereignisse", href: `${base}/ereignisse`, icon: Goal },
    { label: "Charges", href: `${base}/charges`, icon: ChartColumnIncreasing },
    { label: "Abo", href: `${base}/abo`, icon: Gem },
    { label: "Einstellungen", href: `${base}/einstellungen`, icon: Settings }
  ];

  return (
    <div className="space-y-4">
      {/* Mobile-Titel: auf Desktop liefert das Header-Shell bereits den großen
          Vereinsnamen, daher hier nur md:hidden (kein Doppel-Titel). Zahnrad
          (Verwaltung + Konto) lebt hier auf der Übersicht. */}
      <PageHeader
        className="md:hidden"
        title={club.name}
        subtitle="Vereins-Dashboard"
        action={<SettingsButton contextLabel={club.name} overflowItems={clubSettings} />}
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
