import Link from "next/link";
import { eq, and, sql } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import {
  getActiveVerificationForClub,
  getActiveVerificationForTeam
} from "@/lib/db/queries/verifications";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { db } from "@/lib/db/client";
import { sponsors, clubMemberships, clubs, teams } from "@/lib/db/schema";
import { pledges } from "@/lib/db/schema/pledges";
import { VereinHeaderShell } from "./_components/verein-header-shell";
import { VereinFAB } from "./_components/verein-fab";
import { StatusBar, type StatusItem } from "@/components/shared/status-bar";

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

  // Effective-Plan dieses Clubs auflösen — steuert Header-Sichtbarkeit UND ob
  // die Verifizierung Mannschafts- oder Vereins-scoped läuft.
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

  // Verifikations-Status für Banner — SCOPED:
  //   - Mannschaftsabo (basic/pro): Mannschaft ist der Verifizierungs-Scope
  //     (eigene Doc-Typen). Status/Route/Label kommen vom Team.
  //   - Vereinslizenz: Verein-Scope wie gehabt.
  const verifyScope: "team" | "club" =
    isSingleTeamPlan && firstTeamId ? "team" : "club";
  const verifyEntityLabel = verifyScope === "team" ? "Mannschaft" : "Verein";
  let verifiedAt: Date | null = null;
  let verification: { status: string; rejectionReason: string | null } | null = null;
  let verifyHref = `/verein/${slug}/verifikation`;
  if (verifyScope === "team" && firstTeamId) {
    const [teamRow] = await db
      .select({ verifiedAt: teams.verifiedAt })
      .from(teams)
      .where(eq(teams.id, firstTeamId))
      .limit(1);
    verifiedAt = teamRow?.verifiedAt ?? null;
    verification = verifiedAt ? null : await getActiveVerificationForTeam(firstTeamId);
    verifyHref = `/verein/${slug}/mannschaft/${firstTeamId}/verifikation`;
  } else {
    const [verifiedRow] = await db
      .select({ verifiedAt: clubs.verifiedAt })
      .from(clubs)
      .where(eq(clubs.id, club.id))
      .limit(1);
    verifiedAt = verifiedRow?.verifiedAt ?? null;
    verification = verifiedAt ? null : await getActiveVerificationForClub(club.id);
  }

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

  // Alle Status-Hinweise (Verifizierung / Trial / Zahlung) in EIN kompaktes,
  // wegklickbares Element bündeln statt mehrerer großflächiger Banner.
  const statusItems: StatusItem[] = [];

  if (!verifiedAt) {
    if (!verification) {
      statusItems.push({
        id: "verify",
        tone: "warn",
        iconKey: "shield-alert",
        title: `${verifyEntityLabel} noch nicht verifiziert`,
        detail:
          "Lade einen Nachweis hoch — bis dahin werden Rechnungen zurückgehalten.",
        actionLabel: "Hochladen",
        actionHref: verifyHref
      });
    } else if (verification.status === "pending") {
      statusItems.push({
        id: "verify",
        tone: "info",
        iconKey: "shield-check",
        title: "Nachweis wird geprüft",
        detail:
          "Antwort in 1–2 Werktagen. Bis dahin werden Rechnungen zurückgehalten."
      });
    } else if (verification.status === "rejected") {
      statusItems.push({
        id: "verify",
        tone: "danger",
        iconKey: "shield-alert",
        title: "Nachweis abgelehnt",
        detail:
          verification.rejectionReason ??
          "Bitte lade einen neuen Nachweis hoch.",
        actionLabel: "Neu hochladen",
        actionHref: verifyHref
      });
    }
  }

  if (gate.status === "trialing" && gate.trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil((gate.trialEndsAt.getTime() - Date.now()) / 86_400_000)
    );
    const endDate = gate.trialEndsAt.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    statusItems.push({
      id: "trial",
      tone: daysLeft <= 3 ? "danger" : daysLeft <= 7 ? "warn" : "info",
      iconKey: "hourglass",
      title: `Pro-Trial — noch ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}`,
      detail:
        activePledgeCount > 0
          ? `Endet am ${endDate}. Aktiviere dein Abo, damit deine ${activePledgeCount} aktiven Pledge${activePledgeCount === 1 ? "" : "s"} weiterlaufen.`
          : `Endet am ${endDate}. Aktiviere dein Abo, damit das Sponsoring nahtlos weiterläuft.`,
      actionLabel: "Aktivieren",
      actionHref: aboHref
    });
  }

  if (gate.status === "past_due" && !gate.isReadOnly) {
    statusItems.push({
      id: "past_due",
      tone: "warn",
      iconKey: "clock",
      title: "Zahlung überfällig",
      detail: `Noch ${gate.daysUntilReadOnly} Tage bis zum Read-Only-Modus.`,
      actionLabel: "Verwalten",
      actionHref: aboHref
    });
  }

  if (gate.isReadOnly) {
    statusItems.push({
      id: "readonly",
      tone: "danger",
      iconKey: "lock",
      title: gate.status === "cancelled" ? "Abo gekündigt" : "Read-Only-Modus aktiv",
      detail:
        "Neue Pacts + Match-Events sind blockiert. Bestehende Daten bleiben sichtbar.",
      actionLabel: "Reaktivieren",
      actionHref: aboHref
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 md:px-6 pt-4 md:pt-8 pb-28 md:pb-12">
      {/* Header-Bereich: Vereinsname + Sub-Nav.
          Auf /verein/<slug>/mannschaft/<teamId>... bei basic/pro-Lizenzen
          ausgeblendet — der TeamSubNav übernimmt dort die Navigation. */}
      <VereinHeaderShell
        slug={slug}
        clubName={club.name}
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

      {/* Gebündelte Status-Hinweise (Verifizierung / Trial / Zahlung) —
          kompakt, kollabierbar, wegklickbar. Ersetzt die früheren
          großflächigen Einzel-Banner. */}
      <StatusBar items={statusItems} />

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
