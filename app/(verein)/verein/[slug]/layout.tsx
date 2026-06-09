import Link from "next/link";
import { assertVereinSectionAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import {
  getActiveVerificationForClub,
  getActiveVerificationForTeam
} from "@/lib/db/queries/verifications";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { listClubsForUser, getClubById } from "@/lib/db/queries/club-admin";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { countActivePledgesForClub } from "@/lib/db/queries/club-reporting";
import { VereinHeaderShell } from "./_components/verein-header-shell";
import { StatusBar, type StatusItem } from "@/components/shared/status-bar";
import { StatusItemsProvider } from "@/components/shared/status-context";
import { AppNavBarSpacer } from "@/components/shared/app-nav-bar";

export default async function VereinLayout({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  // Lässt auch reine Team-Mitglieder (ohne Club-Mitgliedschaft) durch — sonst
  // Redirect-Loop für via Zugriffs-Anfrage genehmigte Fremd-Mannschaften.
  const access = await assertVereinSectionAccess(slug);
  const { club, user, role: clubRole } = access;
  const isTeamOnly = access.isTeamOnly;
  const gate = await getSubscriptionGate(club.id);

  // Hat dieser User auch ein Sponsor-Profil?
  const sponsorRow = await findSponsorForUser(user.id);

  // Alle Vereine des Users (für Kontext-Switcher)
  const myClubs = await listClubsForUser(user.id);

  // Effective-Plan dieses Clubs auflösen — steuert Header-Sichtbarkeit UND ob
  // die Verifizierung Mannschafts- oder Vereins-scoped läuft.
  let effectivePlan: "basic" | "pro" | "verein" | null = null;
  let firstTeamId: string | null = null;
  try {
    const ids = await getUserIdentities(user.id);
    const thisClub = ids.clubs.find((c) => c.clubId === club.id);
    effectivePlan = thisClub?.effectivePlan ?? null;
    // Team-only-Mitglieder sind nicht in ids.clubs → firstTeamId aus dem
    // Guard (die Mannschaft, über die der Zugriff läuft).
    firstTeamId =
      thisClub?.firstTeamId ??
      ("teamId" in access ? access.teamId : null) ??
      null;
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
    const teamRow = await getTeamInClub(firstTeamId, club.id);
    verifiedAt = teamRow?.verifiedAt ?? null;
    verification = verifiedAt ? null : await getActiveVerificationForTeam(firstTeamId);
    verifyHref = `/verein/${slug}/mannschaft/${firstTeamId}/verifikation`;
  } else {
    const verifiedRow = await getClubById(club.id);
    verifiedAt = verifiedRow?.verifiedAt ?? null;
    verification = verifiedAt ? null : await getActiveVerificationForClub(club.id);
  }

  // Verlust-Aversion im Trial-Banner: wie viele aktive Pledges hängen an den
  // Mannschaften dieses Vereins. Nur relevant/abgefragt während des Trials.
  let activePledgeCount = 0;
  if (gate.status === "trialing") {
    activePledgeCount = await countActivePledgesForClub(club.id);
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

  // Hinweise für die native App-Bar-Glocke (Verifizierung/Trial/Zahlung).
  const navStatusItems = isTeamOnly ? [] : statusItems;

  return (
    <StatusItemsProvider items={navStatusItems}>
    <main className="native-shell mx-auto max-w-5xl px-4 md:px-6 md:pt-8 pb-28 md:pb-12">
      <AppNavBarSpacer />
      {/* Header-Bereich: Vereinsname + Sub-Nav.
          Auf /verein/<slug>/mannschaft/<teamId>... bei basic/pro-Lizenzen
          ausgeblendet — der TeamSubNav übernimmt dort die Navigation. */}
      <VereinHeaderShell
        slug={slug}
        clubName={club.name}
        hasSponsorProfile={!!sponsorRow}
        effectivePlan={effectivePlan}
        isTeamOnly={isTeamOnly}
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
                  : "bg-white shadow-ios-card text-brand-night-navy/60 hover:text-brand-night-navy")
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
      {/* Club-scoped Status-Banner (Trial/Verifizierung/Zahlung) sind für reine
          Team-Mitglieder nicht relevant + nicht actionable → ausblenden.
          Auf der nativen App-Shell (Mobile) liegen diese Hinweise in der
          Glocke oben links → hier nur noch Desktop. */}
      <div className="hidden md:block">
        <StatusBar items={navStatusItems} />
      </div>

      {children}

      {/* Footer nur Desktop — auf Mobile liegen Impressum/Datenschutz/AGB im
          Zahnrad-Sheet (Rechtliches), damit die App-Ansicht kein Web-Chrome trägt. */}
      <footer className="mt-12 md:mt-16 pt-6 border-t border-brand-neutral/40 text-xs text-brand-night-navy/50 hidden md:flex md:flex-row md:items-center md:justify-between gap-2">
        <nav className="flex flex-wrap gap-3 md:gap-4">
          <Link href="/impressum" className="hover:text-accent">Impressum</Link>
          <Link href="/datenschutz" className="hover:text-accent">Datenschutz</Link>
          <Link href="/agb" className="hover:text-accent">AGB</Link>
        </nav>
        <span>© {new Date().getFullYear()} KickPact</span>
      </footer>
    </main>
    </StatusItemsProvider>
  );
}
