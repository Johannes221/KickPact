import Link from "next/link";
import { eq, and, sql } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { getActiveVerificationForClub } from "@/lib/db/queries/verifications";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { db } from "@/lib/db/client";
import { sponsors, clubMemberships, clubs, teams } from "@/lib/db/schema";
import { pledges } from "@/lib/db/schema/pledges";
import { VereinHeaderShell } from "./_components/verein-header-shell";
import { VereinFAB } from "./_components/verein-fab";
import { TrialBanner } from "./_components/trial-banner";

export default async function VereinLayout({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const { club, user, role: clubRole } = await assertClubAccess(slug, "viewer");
  const gate = await getSubscriptionGate(club.id);

  // Hat dieser User auch ein Sponsor-Profil?
  const [sponsorRow] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  // Alle Vereine des Users (für Kontext-Switcher)
  const myClubs = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
    .where(eq(clubMemberships.userId, user.id));

  // Verifikations-Status für Banner. assertClubAccess gibt verifiedAt nicht
  // mit zurück, also einen kleinen Extra-Select hier — minimal-invasiv.
  const [verifiedRow] = await db
    .select({ verifiedAt: clubs.verifiedAt })
    .from(clubs)
    .where(eq(clubs.id, club.id))
    .limit(1);
  const verifiedAt = verifiedRow?.verifiedAt ?? null;
  const verification = verifiedAt
    ? null
    : await getActiveVerificationForClub(club.id);

  // Effective-Plan dieses Clubs auflösen — entscheidet, ob der Vereins-Header
  // auf Mannschafts-Routen ausgeblendet wird (basic/pro: Mannschaft ist der
  // primäre Scope, Vereins-Header wäre nur Lärm).
  let effectivePlan: "basic" | "pro" | "verein" | null = null;
  let firstTeamId: string | null = null;
  try {
    const ids = await getUserIdentities(user.id);
    const thisClub = ids.clubs.find((c) => c.clubId === club.id);
    effectivePlan = thisClub?.effectivePlan ?? null;
    firstTeamId = thisClub?.firstTeamId ?? null;
  } catch {
    // Layout darf nicht wegen Identity-Lookup kippen.
  }

  // Abo-Link je nach Plan: basic/pro pflegen ihr Abo im Mannschafts-Kontext,
  // Vereinslizenzen im Vereins-Abo.
  const isSingleTeamPlan = effectivePlan === "basic" || effectivePlan === "pro";
  const aboHref =
    isSingleTeamPlan && firstTeamId
      ? `/verein/${slug}/mannschaft/${firstTeamId}/abo`
      : `/verein/${slug}/abo`;

  // Verlust-Aversion im Trial-Banner: wie viele aktive Pledges hängen an den
  // Mannschaften dieses Vereins. Nur relevant/abgefragt während des Trials.
  let activePledgeCount = 0;
  if (gate.status === "trialing") {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), eq(pledges.status, "active")));
    activePledgeCount = Number(row?.n ?? 0);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 pt-8 md:pt-12 pb-28 md:pb-12">
      {/* Header-Bereich: Vereinsname + Sub-Nav.
          Auf /verein/<slug>/mannschaft/<teamId>... bei basic/pro-Lizenzen
          ausgeblendet — der TeamSubNav übernimmt dort die Navigation. */}
      <VereinHeaderShell
        slug={slug}
        clubName={club.name}
        verifiedAt={verifiedAt}
        verification={verification}
        hasSponsorProfile={!!sponsorRow}
        effectivePlan={effectivePlan}
      />

      {/* Weitere Vereins-Tabs wenn User mehrere Vereine hat */}
      {myClubs.length > 1 && (
        <div className="mb-5 -mt-2 flex flex-wrap gap-1.5">
          {myClubs.map((c) => (
            <Link
              key={c.id}
              href={`/verein/${c.slug}`}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors " +
                (c.slug === slug
                  ? "bg-brand-night-navy text-white"
                  : "border border-brand-neutral/40 bg-white text-brand-night-navy/60 hover:text-brand-night-navy")
              }
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {/* Trial-Countdown-Banner — immer während des Trials sichtbar, mit
          Verlust-Aversion + plan-korrektem Abo-Link. */}
      {gate.status === "trialing" && gate.trialEndsAt && (
        <TrialBanner
          trialEndsAt={gate.trialEndsAt}
          aboHref={aboHref}
          activePledgeCount={activePledgeCount}
        />
      )}

      {/* Subscription-Warnbanner */}
      {gate.status === "past_due" && !gate.isReadOnly && (
        <div className="mb-5 md:mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5">
          <p className="text-sm text-amber-900">
            <strong>Zahlung überfällig.</strong> Wir konnten deine Stripe-Subscription nicht
            einziehen. Du hast noch {gate.daysUntilReadOnly} Tage, bevor KickPact in den
            Read-Only-Modus geht.{" "}
            <Link href={aboHref} className="underline font-semibold text-amber-900">
              Abo verwalten →
            </Link>
          </p>
        </div>
      )}

      {gate.isReadOnly && (
        <div className="mb-5 md:mb-8 rounded-2xl border border-rose-300 bg-rose-50 p-4 md:p-5">
          <p className="text-sm text-rose-900">
            <strong>
              {gate.status === "cancelled" ? "Abo gekündigt." : "Read-Only-Modus aktiv."}
            </strong>{" "}
            Neue Pacts + Match-Events sind blockiert, bestehende Daten bleiben sichtbar.{" "}
            <Link href={aboHref} className="underline font-semibold text-rose-900">
              Abo reaktivieren →
            </Link>
          </p>
        </div>
      )}

      {children}

      {/* Mobile FAB — only visible on small screens */}
      <VereinFAB slug={slug} clubRole={clubRole} />

      <footer className="mt-12 md:mt-16 pt-6 border-t border-brand-neutral/40 text-xs text-brand-night-navy/50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <nav className="flex flex-wrap gap-3 md:gap-4">
          <Link href="/impressum" className="hover:text-accent">Impressum</Link>
          <Link href="/datenschutz" className="hover:text-accent">Datenschutz</Link>
          <Link href="/agb" className="hover:text-accent">AGB</Link>
        </nav>
        <span>© {new Date().getFullYear()} KickPact</span>
      </footer>
    </main>
  );
}
