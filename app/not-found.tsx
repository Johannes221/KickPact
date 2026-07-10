import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Gebrandete 404. Next.js rendert das hier bei `notFound()` (z.B. veraltete/
 * getippte öffentliche Profil-Links `/m/<slug>`, `/v/<slug>`) statt der nackten
 * englischen Default-Seite. Server Component — kein State nötig.
 */
export const metadata = { title: "Seite nicht gefunden · KickPact" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center px-5 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent/10 text-accent-dark">
        <Compass className="h-7 w-7" aria-hidden />
      </div>
      <p className="font-mono text-sm font-bold uppercase tracking-widest text-brand-night-navy/50">
        404
      </p>
      <h1 className="mt-2 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
        Diese Seite gibt&apos;s nicht (mehr).
      </h1>
      <p className="mt-3 max-w-md text-sm text-brand-night-navy/70">
        Vielleicht ist der Link veraltet oder hat sich ein Tippfehler
        eingeschlichen. Zurück aufs Spielfeld:
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
        >
          Zur Startseite
        </Link>
        <Link
          href="/mannschaften"
          className="inline-flex h-11 items-center rounded-lg border border-brand-neutral/40 bg-white px-4 text-sm font-semibold text-brand-night-navy transition-colors hover:bg-brand-off-white"
        >
          Mannschaften entdecken
        </Link>
      </div>
    </main>
  );
}
