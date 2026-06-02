import Link from "next/link";
import { eq, count } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users, sessions, accounts } from "@/lib/db/schema/auth";
import { sponsors } from "@/lib/db/schema/sponsors";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { DeletionBanner } from "./_components/deletion-banner";
import { DataPrivacyActions } from "./_components/data-privacy-actions";

export const metadata = { title: "Mein Konto · KickPact" };

export default async function KontoPage() {
  const user = await requireUser();

  const [userRow] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      image: users.image,
      deletionRequestedAt: users.deletionRequestedAt,
      createdAt: users.createdAt
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [{ n: sessionCount } = { n: 0 }] = await db
    .select({ n: count() })
    .from(sessions)
    .where(eq(sessions.userId, user.id));

  const linkedAccounts = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, user.id));

  const identities = await getUserIdentities(user.id);

  // Sponsor-Type wird nicht in UserIdentities zurückgegeben — separater Lookup
  // damit das Label „Familie/Business" auf der Karte stimmt.
  const [sponsorRow] = identities.sponsor
    ? await db
        .select({ type: sponsors.type })
        .from(sponsors)
        .where(eq(sponsors.userId, user.id))
        .limit(1)
    : [];
  const sponsorType = sponsorRow?.type ?? null;

  const deletionScheduledFor = userRow?.deletionRequestedAt
    ? new Date(userRow.deletionRequestedAt.getTime() + 14 * 24 * 60 * 60 * 1000)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12 space-y-6 md:space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
          Konto-Einstellungen
        </p>
        <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          Mein Konto
        </h1>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Profil, Sicherheit und deine DSGVO-Rechte an einem Ort.
        </p>
      </header>

      {userRow?.deletionRequestedAt && deletionScheduledFor && (
        <DeletionBanner
          requestedAt={userRow.deletionRequestedAt}
          scheduledFor={deletionScheduledFor}
        />
      )}

      {/* === Profil === */}
      <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-4">
        <div>
          <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
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
      <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-4">
        <div>
          <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
            Meine Rollen
          </h2>
          <p className="mt-0.5 text-xs text-brand-night-navy/60">
            Du kannst gleichzeitig Verein, Mannschaft und Sponsor sein — über das
            Menü oben rechts wechselst du zwischen den Rollen.
          </p>
        </div>

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
              <Link
                href={`/verein/${c.slug}`}
                className="shrink-0 text-xs font-semibold text-accent underline"
              >
                Öffnen →
              </Link>
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
              <Link
                href={`/verein/${t.clubSlug}/mannschaft/${t.teamId}`}
                className="shrink-0 text-xs font-semibold text-accent underline"
              >
                Öffnen →
              </Link>
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
                  Sponsor{sponsorType ? ` · ${sponsorType}` : ""}
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

      {/* === Sicherheit === */}
      <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-3">
        <div>
          <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
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

      {/* === Daten & Privatsphäre === */}
      <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-4">
        <div>
          <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
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
