import Link from "next/link";
import { requireUser } from "@/lib/auth/session";

export default async function SponsorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Sponsor-Dashboard
        </h1>
      </div>
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
