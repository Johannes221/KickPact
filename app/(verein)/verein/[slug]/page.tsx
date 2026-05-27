import { eq, sql, and, gte } from "drizzle-orm";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { charges } from "@/lib/db/schema/charges";
import { pledges } from "@/lib/db/schema/pledges";
import { matches } from "@/lib/db/schema/matches";
import { DashboardTile } from "@/components/shared/dashboard-tile";

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

  // Month-start in UTC for "this month" stats
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // 7-day window for "diese Woche"
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    teamRows,
    activePledgeCount,
    weeklyChargeCents,
    monthlyChargeCents,
    recentMatchCount
  ] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.clubId, club.id), eq(teams.isActive, true))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), eq(pledges.status, "active")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), gte(charges.createdAt, weekStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), gte(charges.createdAt, monthStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .innerJoin(teams, eq(matches.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), gte(matches.datum, weekStart)))
      .then((r) => Number(r[0]?.n ?? 0))
  ]);

  const teamCount = teamRows.length;

  return (
    <div className="space-y-4">
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
        icon="🏆"
        title="Diese Woche"
        primary={eur(weeklyChargeCents)}
        secondary={`${recentMatchCount} Spiel${recentMatchCount === 1 ? "" : "e"} · ${eur(monthlyChargeCents)} diesen Monat`}
        href={`/verein/${slug}/abrechnungen`}
      />

      <DashboardTile
        icon="⚽"
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
        icon="💚"
        title="Aktive Sponsoren"
        primary={String(activePledgeCount)}
        secondary={
          activePledgeCount === 0
            ? "Noch keine Pledges aktiv"
            : "Tippen für die volle Sponsoren-Liste"
        }
        href={`/verein/${slug}/sponsoren`}
      />

      <DashboardTile
        icon="📄"
        title="Letzte Abrechnungen"
        primary={eur(monthlyChargeCents)}
        secondary="Diesen Monat erfasst"
        href={`/verein/${slug}/abrechnungen`}
      />

      <DashboardTile
        icon="🤝"
        title="Einladungslink teilen"
        primary="Sponsoren werben"
        secondary="WhatsApp · Mail · Stammtisch — Sponsoren legen Pledges selbst fest"
        href={`/verein/${slug}/sponsoren`}
        variant="cta"
        className="md:col-span-2"
      />
    </div>
    </div>
  );
}
