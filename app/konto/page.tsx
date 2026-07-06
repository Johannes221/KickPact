import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bell, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { getAccountOverview } from "@/lib/db/queries/account";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { flattenIdentities } from "@/lib/auth/identity-routing";
import {
  getStoredPrimaryRole,
  primaryDestinationFor
} from "@/lib/auth/primary-role";
import { countUnreadNotifications } from "@/lib/db/queries/notifications";
import { listPendingTransferRequestsForUser } from "@/lib/db/queries/license-transfers";
import { LicenseTransferCard } from "./_components/license-transfer-card";
import { DeletionBanner } from "./_components/deletion-banner";
import { DataPrivacyActions } from "./_components/data-privacy-actions";
import { AvatarUpload } from "./_components/avatar-upload";
import { PrimaryRoleSelector } from "./_components/primary-role-selector";
import { LeaveMembershipButton } from "./_components/leave-membership-button";
import { LoginMethods } from "./_components/login-methods";
import { configuredSocialProviders } from "@/lib/auth/server";

export const metadata = { title: "Mein Konto · KickPact" };

export default async function KontoPage() {
  const user = await requireUser();

  const { userRow, sessionCount, linkedAccounts } = await getAccountOverview(user.id);

  const identities = await getUserIdentities(user.id);
  const unreadNotifications = await countUnreadNotifications(user.id);

  // Paket B (Spec §1.5): offene Lizenz-Transfer-Anfragen, über die DIESER
  // User (Lizenz-Inhaber) entscheiden muss.
  const licenseTransferRequests = await listPendingTransferRequestsForUser(user.id);

  // Privatpersonen-only (Spec 2026-07-06): kein Typ-Suffix mehr auf der
  // Sponsor-Karte — alle Sponsoren sind privat, das rohe Enum-Label
  // („familie") wäre nur Rauschen.

  // Hauptrollen-Auswahl: serialisierbare Options (flattenIdentities-Einträge
  // ohne die nicht-serialisierbare `matches`-Funktion) + aktuell aufgelöste
  // Hauptrolle. Nur bei 2+ Rollen relevant.
  const roleEntries = flattenIdentities(identities);
  const storedPrimaryRole = await getStoredPrimaryRole(user.id);
  const currentPrimaryId = primaryDestinationFor(
    identities,
    storedPrimaryRole
  ).resolvedId;
  const primaryRoleOptions = roleEntries.map((e) => ({
    id: e.id,
    label: e.label,
    subline: e.subline,
    kind: e.kind
  }));

  const avatarInitials =
    (userRow?.name ?? user.email)
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || user.email[0]!.toUpperCase();

  const linkedProviderIds = linkedAccounts.map((a) => a.providerId);
  // configuredSocialProviders ist `("google" | "apple")[]`; LoginMethods bietet
  // nur diese beiden Provider an. Stabile Reihenfolge: Apple zuerst (iOS-First).
  const linkableProviders = (["apple", "google"] as const).filter((p) =>
    configuredSocialProviders.includes(p)
  );

  const deletionScheduledFor = userRow?.deletionRequestedAt
    ? new Date(userRow.deletionRequestedAt.getTime() + 14 * 24 * 60 * 60 * 1000)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12 space-y-6 md:space-y-8">
      <PageHeader
        title="Mein Konto"
        subtitle="Profil, Sicherheit und deine DSGVO-Rechte an einem Ort."
      />

      {userRow?.deletionRequestedAt && deletionScheduledFor && (
        <DeletionBanner
          requestedAt={userRow.deletionRequestedAt}
          scheduledFor={deletionScheduledFor}
        />
      )}

      {/* === Lizenz-Transfer-Anfragen (Spec §1.5) === */}
      {licenseTransferRequests.length > 0 && (
        <LicenseTransferCard
          requests={licenseTransferRequests.map((r) => ({
            id: r.id,
            teamName: r.teamName,
            toClubName: r.toClubName,
            requestedByName: r.requestedByName
          }))}
        />
      )}

      {/* === Benachrichtigungen === */}
      <Link
        href="/konto/benachrichtigungen"
        className="flex items-center justify-between gap-3 rounded-2xl bg-white shadow-ios-card p-5 md:p-6 transition-colors hover:border-accent/50"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
          >
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
              Benachrichtigungen
            </h2>
            <p className="mt-0.5 text-xs text-brand-night-navy/60">
              Push-Mitteilungen in der App steuern und den Verlauf einsehen.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unreadNotifications > 0 && (
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">
              {unreadNotifications}
            </span>
          )}
          <ChevronRight aria-hidden className="h-5 w-5 text-brand-night-navy/30" />
        </div>
      </Link>

      {/* === Profil === */}
      <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
        <div>
          <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
            Profil
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            Diese Angaben stammen aus deinem Login-Anbieter. Änderungen folgen
            in einer späteren Version — bis dahin Mail an{" "}
            <a href="mailto:hello@kickpact.com" className="underline">
              hello@kickpact.com
            </a>
            .
          </p>
        </div>

        <AvatarUpload initials={avatarInitials} image={userRow?.image ?? null} />

        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-[0.7rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
              E-Mail
            </dt>
            <dd className="mt-1 font-medium text-brand-night-navy break-all">
              {userRow?.email ?? user.email}
              {userRow?.emailVerified && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-800">
                  ✓ Verifiziert
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
              Name
            </dt>
            <dd className="mt-1 font-medium text-brand-night-navy">
              {userRow?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
              Konto erstellt
            </dt>
            <dd className="mt-1 text-brand-night-navy">
              {userRow?.createdAt
                ? new Date(userRow.createdAt).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                  })
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
              Login-Anbieter
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {linkedAccounts.length === 0 ? (
                <span className="text-xs text-brand-night-navy/60">
                  Magic-Link via E-Mail
                </span>
              ) : (
                linkedAccounts.map((a) => (
                  <span
                    key={a.providerId}
                    className="inline-flex items-center rounded-full bg-brand-off-white border border-brand-neutral/40 px-2 py-0.5 text-[0.7rem] font-semibold text-brand-night-navy"
                  >
                    {providerLabel(a.providerId)}
                  </span>
                ))
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* === Rollen-Übersicht === */}
      <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
        <div>
          <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
            Meine Rollen
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            Du kannst gleichzeitig Verein, Mannschaft und Sponsor sein — über das
            Menü oben rechts wechselst du zwischen den Rollen.
          </p>
        </div>

        {primaryRoleOptions.length >= 2 && (
          <PrimaryRoleSelector
            options={primaryRoleOptions}
            currentId={currentPrimaryId}
          />
        )}

        <ul className="space-y-2">
          {identities.clubs.map((c) => (
            <li
              key={`club-${c.clubId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-brand-neutral/30 bg-brand-off-white px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span aria-hidden>🏟️</span>
                <span className="font-medium truncate">{c.name}</span>
                <span className="text-[0.7rem] uppercase tracking-wide font-semibold text-brand-night-navy/50">
                  {c.role}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* B5: Self-Service-Austritt (letzter Admin wird serverseitig geblockt) */}
                <LeaveMembershipButton kind="club" id={c.clubId} name={c.name} />
                <Link
                  href={`/verein/${c.slug}`}
                  className="text-xs font-semibold text-accent underline"
                >
                  Öffnen →
                </Link>
              </div>
            </li>
          ))}
          {identities.teamOnly.map((t) => (
            <li
              key={`team-${t.teamId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-brand-neutral/30 bg-brand-off-white px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span aria-hidden>⚽</span>
                <span className="font-medium truncate">{t.teamName}</span>
                <span className="text-[0.7rem] text-brand-night-navy/50 truncate">
                  {t.clubName} · {t.role}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <LeaveMembershipButton kind="team" id={t.teamId} name={t.teamName} />
                <Link
                  href={`/verein/${t.clubSlug}/mannschaft/${t.teamId}`}
                  className="text-xs font-semibold text-accent underline"
                >
                  Öffnen →
                </Link>
              </div>
            </li>
          ))}
          {identities.sponsor && (
            <li className="flex items-center justify-between gap-3 rounded-xl border border-brand-neutral/30 bg-brand-off-white px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span aria-hidden>💚</span>
                <span className="font-medium truncate">
                  {identities.sponsor.displayName}
                </span>
                <span className="text-[0.7rem] uppercase tracking-wide font-semibold text-brand-night-navy/50">
                  Sponsor
                </span>
              </div>
              <Link
                href="/sponsor"
                className="shrink-0 text-xs font-semibold text-accent underline"
              >
                Öffnen →
              </Link>
            </li>
          )}
          {identities.clubs.length === 0 &&
            identities.teamOnly.length === 0 &&
            !identities.sponsor && (
              <li className="text-sm text-brand-night-navy/60">
                Noch keine Rollen. Lege eine Mannschaft oder einen Verein an, oder
                nimm eine Sponsor-Einladung an.
              </li>
            )}
        </ul>

        <Link
          href="/signup?add=1"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline"
        >
          + Neue Rolle hinzufügen
        </Link>
      </section>

      {/* === Anmeldemethoden === */}
      <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
        <div>
          <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
            Anmeldemethoden
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            Verknüpfe Apple oder Google mit deinem Konto, damit du dich über
            mehrere Wege einloggen kannst — alle landen im selben Konto inkl.
            deiner Mannschaften und Rollen.
          </p>
        </div>
        <LoginMethods
          linkedProviderIds={linkedProviderIds}
          configuredProviders={linkableProviders}
        />
      </section>

      {/* === Sicherheit === */}
      <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-3">
        <div>
          <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
            Sicherheit
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            Aktive Sessions: <strong>{sessionCount}</strong>. Sessions laufen
            nach 30 Tagen Inaktivität automatisch ab.
          </p>
        </div>
        <p className="text-xs text-brand-night-navy/60">
          „Aus allen Geräten abmelden", 2-Faktor-Auth und Login-Historie folgen in
          einer späteren Version.
        </p>
      </section>

      {/* === Hilfe & Support === */}
      <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-3">
        <div>
          <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
            Hilfe &amp; Support
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            Ein Problem, ein Fehler oder eine Frage? Meld dich — du siehst hier
            Status und Verlauf all deiner Anfragen.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="accent" size="sm">
            <Link href="/konto/support">Meine Anfragen</Link>
          </Button>
          <Link
            href="/hilfe"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-neutral/40 px-4 py-2 text-sm font-semibold text-brand-night-navy hover:bg-brand-off-white"
          >
            Hilfe-Center
          </Link>
        </div>
      </section>

      {/* === Daten & Privatsphäre === */}
      <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
        <div>
          <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
            Daten &amp; Privatsphäre
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            DSGVO Art. 15 (Auskunft) · Art. 20 (Datenübertragbarkeit) · Art. 17
            (Recht auf Löschung).
          </p>
        </div>
        <DataPrivacyActions
          hasPendingDeletion={!!userRow?.deletionRequestedAt}
        />
      </section>

      <footer className="pt-4 border-t border-brand-neutral/40 text-xs text-brand-night-navy/50 flex flex-wrap gap-3 md:gap-4">
        <Link href="/impressum" className="hover:text-accent">
          Impressum
        </Link>
        <Link href="/datenschutz" className="hover:text-accent">
          Datenschutz
        </Link>
        <Link href="/agb" className="hover:text-accent">
          AGB
        </Link>
      </footer>
    </main>
  );
}

function providerLabel(providerId: string): string {
  if (providerId === "google") return "Google";
  if (providerId === "apple") return "Apple";
  if (providerId === "credential") return "E-Mail · Magic-Link";
  return providerId;
}
