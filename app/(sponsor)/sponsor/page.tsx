import Link from "next/link";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { pledges } from "@/lib/db/schema/pledges";
import { charges } from "@/lib/db/schema/charges";
import { DashboardTile } from "@/components/shared/dashboard-tile";

export const metadata = { title: "Sponsor · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function SponsorDashboard() {
  const user = await requireUser();

  const [sponsorRow] = await db
    .select({ id: sponsors.id, displayName: sponsors.displayName, type: sponsors.type })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  // Empty state: no sponsor profile yet
  if (!sponsorRow) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="text-5xl">💚</div>
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
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [activePledgeCount, monthlyCents, biggestRecent] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .where(and(eq(pledges.sponsorId, sponsorRow.id), eq(pledges.status, "active")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(eq(pledges.sponsorId, sponsorRow.id), gte(charges.createdAt, monthStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({
        amountCents: charges.amountCents,
        triggerType: charges.triggerType,
        createdAt: charges.createdAt
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(eq(pledges.sponsorId, sponsorRow.id))
      .orderBy(desc(charges.amountCents))
      .limit(1)
      .then((r) => r[0] ?? null)
  ]);

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
          icon="💸"
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
          icon="🤝"
          title="Meine Pledges"
          primary={String(activePledgeCount)}
          secondary={
            activePledgeCount === 0
              ? "Noch keine aktiven Pledges"
              : "Tippen für Übersicht"
          }
          href="/sponsor/pledge"
        />

        {biggestRecent && biggestRecent.amountCents > 0 && (
          <DashboardTile
            icon="⭐"
            title="Geilster Moment"
            primary={eur(biggestRecent.amountCents)}
            secondary={`Trigger: ${biggestRecent.triggerType}`}
            className="md:col-span-2"
          />
        )}

        <DashboardTile
          icon="🔍"
          title="Neue Mannschaft entdecken"
          primary="Mannschaften finden"
          secondary="Lokale Vereine, die offen sind für Sponsoren"
          href="/sponsor/discover"
          variant="cta"
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}
