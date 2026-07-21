import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export const metadata = {
  // `absolute`: Marke vorne statt Layout-Template.
  title: { absolute: "KickPact holen – App laden oder im Browser starten" },
  description:
    "Lade die KickPact-App fürs iPhone oder leg direkt im Browser los. Familie, Freunde und Fans füllen die Mannschaftskasse. 30 Tage gratis.",
  // Link-in-Bio-Splash: dünne Utility-Seite, gehört nicht in den Index.
  robots: { index: false, follow: true },
};

// TODO(App Store): echten App-Store-Link eintragen, sobald die iOS-App live ist.
// Solange leer, zeigt das Badge automatisch den „bald verfügbar"-Zustand.
const APP_STORE_URL = "";

export default function AppLandingPage() {
  const appStoreLive = APP_STORE_URL.length > 0;

  return (
    <main className="relative flex min-h-[85svh] flex-col items-center justify-center overflow-hidden bg-brand-off-white px-5 py-12">
      {/* Sanfte Akzent-Wolken im Hintergrund, gleiche Sprache wie der Final-CTA
          der Landing. */}
      <div
        className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md text-center">
        <Image
          src="/brand/logo-navy-stacked.svg"
          alt="KickPact"
          width={132}
          height={132}
          priority
          className="mx-auto h-24 w-auto"
        />

        <h1 className="mt-6 font-display font-black text-3xl sm:text-4xl leading-[1.1] tracking-tight text-brand-night-navy">
          Fülle eure <span className="text-accent">Mannschaftskasse.</span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-brand-night-navy/70 leading-relaxed">
          Freunde, Familie und Fans geben pro Tor, Sieg und Einsatz. Such dir aus,
          wie du startest. 30 Tage gratis, ohne Karte.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {/* Primär: funktioniert sofort. */}
          <Link
            href="/signup"
            className="group inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-accent px-6 py-4 text-base font-bold text-white shadow-sm ring-1 ring-accent/40 transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-off-white"
          >
            <span>Im Browser loslegen</span>
            <ArrowRight
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>

          {/* Sekundär: iOS-App via App Store. Solange kein Link hinterlegt ist,
              nicht klickbar + „bald"-Hinweis. */}
          <AppStoreButton href={APP_STORE_URL} live={appStoreLive} />
        </div>

        <p className="mt-6 text-xs text-brand-night-navy/50">
          Kein Vertrag, kein Risiko für deine Mannschaft. Monatlich kündbar.
        </p>
      </div>
    </main>
  );
}

/**
 * „Download im App Store"-Badge. Ist ein echter Link, sobald `live`, sonst ein
 * gedämpfter, nicht-fokussierbarer Platzhalter mit „bald"-Pille.
 */
function AppStoreButton({ href, live }: { href: string; live: boolean }) {
  const badge = <AppStoreBadge />;

  if (live) {
    return (
      <a
        href={href}
        className="inline-flex w-full items-center justify-center rounded-2xl border border-brand-neutral/40 bg-brand-night-navy px-6 py-3 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-off-white"
        aria-label="KickPact im App Store laden"
      >
        {badge}
      </a>
    );
  }

  return (
    <div
      className="relative inline-flex w-full cursor-not-allowed items-center justify-center rounded-2xl border border-brand-neutral/40 bg-brand-night-navy/70 px-6 py-3 opacity-90"
      aria-label="KickPact im App Store – bald verfügbar"
    >
      <div className="opacity-60">{badge}</div>
      <span className="absolute -top-2 right-3 rounded-full bg-accent px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white shadow-sm">
        Bald
      </span>
    </div>
  );
}

/**
 * „Download on the App Store"-Badge als Inline-SVG (Apple-Marketing-Button für
 * die eigene App). Skaliert responsiv über die Höhe.
 */
function AppStoreBadge() {
  return (
    <svg
      viewBox="0 0 120 40"
      role="img"
      aria-label="Download on the App Store"
      className="h-10 w-auto"
    >
      <g transform="translate(10 8.6) scale(0.62)" fill="#fff">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </g>
      <text
        x="33"
        y="16.5"
        fill="#fff"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize="5.6"
      >
        Download im
      </text>
      <text
        x="33"
        y="30"
        fill="#fff"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize="12.5"
        fontWeight="600"
      >
        App Store
      </text>
    </svg>
  );
}
