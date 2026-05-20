import Link from "next/link";
import { assertClubAccess } from "@/lib/auth/scope";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";

export default async function VereinLayout({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "viewer");
  const gate = await getSubscriptionGate(club.id);

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
          {club.name}
        </h1>
        <p className="text-sm md:text-base text-brand-night-navy/60">Vereins-Dashboard</p>
      </div>

      {gate.status === "past_due" && !gate.isReadOnly && (
        <div className="mb-5 md:mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5">
          <p className="text-sm text-amber-900">
            <strong>Zahlung überfällig.</strong> Wir konnten deine Stripe-Subscription nicht
            einziehen. Du hast noch {gate.daysUntilReadOnly} Tage, bevor KickPact in den
            Read-Only-Modus geht.{" "}
            <Link
              href={`/verein/${slug}/abo`}
              className="underline font-semibold text-amber-900"
            >
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
            <Link
              href={`/verein/${slug}/abo`}
              className="underline font-semibold text-rose-900"
            >
              Abo reaktivieren →
            </Link>
          </p>
        </div>
      )}

      {children}

      <footer className="mt-12 md:mt-16 pt-6 border-t border-brand-neutral/40 text-xs text-brand-night-navy/50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <nav className="flex flex-wrap gap-3 md:gap-4">
          <Link href="/impressum" className="hover:text-accent">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-accent">
            Datenschutz
          </Link>
          <Link href="/agb" className="hover:text-accent">
            AGB
          </Link>
        </nav>
        <span>© {new Date().getFullYear()} KickPact</span>
      </footer>
    </main>
  );
}
