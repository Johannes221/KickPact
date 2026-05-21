import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clubMemberships, clubs } from "@/lib/db/schema";
import { SponsorSubNav } from "./_components/sponsor-sub-nav";

export default async function SponsorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Hat dieser User auch Verein(e) als Admin?
  const myClubs = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
    .where(eq(clubMemberships.userId, user.id));

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
              Mein Bereich
            </p>
            <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
              Sponsor-Dashboard
            </h1>
          </div>

          {/* Kontext-Switcher: nur wenn User auch Vereins-Admin ist */}
          {myClubs.length === 1 && (
            <Link
              href={`/verein/${myClubs[0].slug}`}
              className="shrink-0 mt-1 inline-flex items-center gap-1.5 rounded-full border border-brand-neutral/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white hover:text-brand-night-navy transition-colors"
            >
              <span className="text-base leading-none">⚽</span>
              Vereins-Dashboard
            </Link>
          )}

          {myClubs.length > 1 && (
            <div className="shrink-0 flex flex-col gap-1 mt-1">
              {myClubs.map((c) => (
                <Link
                  key={c.id}
                  href={`/verein/${c.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-neutral/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white hover:text-brand-night-navy transition-colors"
                >
                  <span className="text-base leading-none">⚽</span>
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        <SponsorSubNav />
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
