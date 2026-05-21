import Link from "next/link";
import { eq } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { db } from "@/lib/db/client";
import { sponsors, clubMemberships, clubs } from "@/lib/db/schema";
import { VereinSubNav } from "./_components/verein-sub-nav";

export default async function VereinLayout({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const { club, user } = await assertClubAccess(slug, "viewer");
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

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      {/* Header-Bereich: Vereinsname + Sub-Nav */}
      <div className="mb-6 md:mb-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
              Vereins-Dashboard
            </p>
            <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
              {club.name}
            </h1>
          </div>

          {/* Kontext-Switcher: nur wenn User auch Sponsor ist */}
          {sponsorRow && (
            <Link
              href="/sponsor"
              className="shrink-0 mt-1 inline-flex items-center gap-1.5 rounded-full border border-brand-neutral/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white hover:text-brand-night-navy transition-colors"
            >
              <span className="text-base leading-none">⚡</span>
              Sponsor-Bereich
            </Link>
          )}
        </div>

        <VereinSubNav slug={slug} />
      </div>

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

      {/* Subscription-Warnbanner */}
      {gate.status === "past_due" && !gate.isReadOnly && (
        <div className="mb-5 md:mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5">
          <p className="text-sm text-amber-900">
            <strong>Zahlung überfällig.</strong> Wir konnten deine Stripe-Subscription nicht
            einziehen. Du hast noch {gate.daysUntilReadOnly} Tage, bevor KickPact in den
            Read-Only-Modus geht.{" "}
            <Link href={`/verein/${slug}/abo`} className="underline font-semibold text-amber-900">
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
            Neue Pledges + Match-Events sind blockiert, bestehende Daten bleiben sichtbar.{" "}
            <Link href={`/verein/${slug}/abo`} className="underline font-semibold text-rose-900">
              Abo reaktivieren →
            </Link>
          </p>
        </div>
      )}

      {children}

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
