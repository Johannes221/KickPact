import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { SponsorSubNav } from "./_components/sponsor-sub-nav";
import { countPendingForSponsor } from "@/lib/db/queries/approvals";

export default async function SponsorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const pendingCount = await countPendingForSponsor(user.id);

  // Rollen-Wechsel (zu Verein/Mannschaft, falls der User auch dort aktiv ist)
  // läuft über den globalen Rollen-Switcher im Header — kein doppelter
  // Inline-Switcher mehr.
  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 pt-8 md:pt-12 pb-28 md:pb-12">
      <div className="mb-6 md:mb-10">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
            Mein Bereich
          </p>
          <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
            Sponsor-Dashboard
          </h1>
        </div>

        <SponsorSubNav pendingCount={pendingCount} />
      </div>

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
