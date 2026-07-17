import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shared/app-header";
import { CookieBanner } from "@/components/shared/cookie-banner";
import { PushRegistrar } from "@/components/native/push-registrar";
import { PlausibleScript } from "@/components/analytics/plausible-script";
import { getServerSession } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import {
  getStoredPrimaryRole,
  primaryDestinationFor
} from "@/lib/auth/primary-role";

// Body / UI: Inter (broad latin coverage, weight 400-900)
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-sans",
  display: "swap"
});

/**
 * Display / Headlines: KickPact Display — Orbitron Black mit reparierter Null.
 *
 * Löst Montserrat Alternates ab (Johannes, 2026-07-17): Orbitron trifft den
 * KICKPACT-Schriftzug deutlich besser — quadratische Punzen, flach
 * abgeschnittenes C, kantiges K.
 *
 * Warum nicht Orbitron direkt: es zeichnet die Null durchgestrichen. Auf dieser
 * Seite hätte das genau die Geld-Headlines getroffen („200 € wenn der Aufstieg
 * klappt" → „2ØØ €"). Die Null trägt deshalb jetzt die Form von Orbitrons
 * eigenem „O". Der eigene Name ist OFL-Pflicht (Orbitron hat einen Reserved Font
 * Name), nicht Kosmetik — s. public/fonts/kickpact-display/README.md.
 *
 * `next/font/local` statt `next/font/google`: die Datei liegt im Repo, weil
 * dieselbe Datei auch die Share-Motive setzt (lib/og/fonts.ts). Satori kann kein
 * woff2 und nichts nachladen — EINE Quelle für Web, App und Motive.
 */
const displayFont = localFont({
  src: "../public/fonts/kickpact-display/KickPactDisplay-Black.ttf",
  weight: "900",
  style: "normal",
  variable: "--font-display",
  display: "swap"
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "KickPact – Sponsoring für Amateurfußball",
    template: "%s – KickPact",
  },
  description:
    "Performance-basiertes Sponsoring für Amateurfußball. Sponsoren zahlen pro Tor, Sieg oder Einsatz – vollautomatisch abgerechnet. Weniger als 1 € pro Spieler im Monat.",
  keywords: [
    "Amateurfußball Sponsoring",
    "Vereinssponsoring Fußball",
    "Sponsor Amateurverein finden",
    "Performance Sponsoring Sport",
    "Fußballverein Sponsor automatisch",
    "KickPact",
  ],
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "KickPact",
    title: "KickPact – Sponsoring für Amateurfußball",
    description:
      "Performance-basiertes Sponsoring für Amateurfußball. Sponsoren zahlen pro Tor, Sieg oder Einsatz – vollautomatisch abgerechnet.",
    url: BASE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "KickPact – Sponsoring für Amateurfußball",
    description:
      "Sponsoren zahlen pro Tor, Sieg oder Einsatz. Weniger als 1 € pro Spieler im Monat.",
  },
  robots: {
    // Individuelle Seiten können das überschreiben; Staging-Blocking läuft via robots.ts
    index: true,
    follow: true,
  },
  alternates: {
    canonical: BASE_URL,
  },
  // Native-App-Vorbereitung (Capacitor/iOS): standalone-Statusbar-Verhalten,
  // wenn die App via WebView-Wrapper läuft. Im Browser ohne Effekt.
  appleWebApp: {
    capable: true,
    title: "KickPact",
    statusBarStyle: "default",
  },
};

// viewport-fit=cover ist die Voraussetzung dafür, dass env(safe-area-inset-*)
// auf iOS überhaupt Werte != 0 liefert (Notch/Home-Indicator). Die Bottom-Tab-
// Bar und der Header nutzen diese Insets bereits — ohne cover bleiben sie 0.
// themeColor matcht den Off-White-Body, damit die iOS-Statusbar nahtlos wirkt.
//
// Zoom: In der nativen iOS-App (Capacitor-WebView) ist JEGLICHER Zoom verboten
// (App-Feel): kein Pinch-Zoom, kein Doppeltipp-Zoom und kein Auto-Zoom beim
// Fokussieren von Eingabefeldern (iOS zoomt sonst bei font-size < 16px rein).
// `maximumScale: 1 + userScalable: false` schaltet das im WKWebView zuverlässig
// ab. Im normalen Browser BLEIBT Zoom erlaubt (Accessibility/SEO) — deshalb per
// User-Agent (`KickPactApp`) unterschieden statt global.
export async function generateViewport(): Promise<Viewport> {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isNativeApp = userAgent.includes("KickPactApp");
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#F5F8F5",
    ...(isNativeApp ? { maximumScale: 1, userScalable: false } : {})
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Session + Identity-basiertes Logo-Routing: eingeloggte User springen vom
  // Logo direkt in ihre Hauptrolle (nie /select-role, nie Marketing-Landing).
  // Read-only — der lazy Default-Persist passiert nur im /dashboard-Dispatcher.
  // Bei Auth-Fehler oder unauth.: Default "/".
  const session = await getServerSession().catch(() => null);
  let dashboardHref = "/";
  if (session?.user?.id) {
    try {
      const [ids, stored] = await Promise.all([
        getUserIdentities(session.user.id),
        getStoredPrimaryRole(session.user.id)
      ]);
      dashboardHref = primaryDestinationFor(ids, stored).href;
    } catch {
      // Identity-Lookup darf das Layout NIE kippen — fallback auf "/" ist
      // semantisch sinnvoll (User landet im schlimmsten Fall einmal auf der
      // Landing, klickt Login/Profil).
    }
  }
  const authenticated = !!session?.user;

  // Native iOS-App? Capacitor hängt `KickPactApp` an den User-Agent (WS-8).
  // Serverseitig erkannt → kein Flash beim Ausblenden der Marketing-Chrome.
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isNativeApp = userAgent.includes("KickPactApp");

  return (
    <html lang="de" className={`${inter.variable} ${displayFont.variable}`}>
      <head>
        <PlausibleScript />
        {/* Schema.org Organization — hilft Google KickPact als Marke zu verstehen */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "KickPact",
              url: BASE_URL,
              description:
                "Performance-basiertes Sponsoring im Amateurfußball. Sponsoren zahlen pro Tor, Sieg oder Einsatz – vollautomatisch abgerechnet.",
              foundingDate: "2026",
              areaServed: "DE",
              serviceType: "Sports Sponsorship Platform",
            }),
          }}
        />
      </head>
      <body className="font-sans bg-brand-off-white text-brand-night-navy">
        {/* Skip-Link für Tastatur-Nutzer: standardmäßig visuell versteckt,
            taucht beim Fokussieren auf (Tab als erstes Element). Zielt auf
            #main; jede Page rendert mindestens das App-Layout, das die
            entsprechenden <main>-Container hat. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          Zum Inhalt springen
        </a>
        <AppHeader
          authenticated={authenticated}
          dashboardHref={dashboardHref}
          isNativeApp={isNativeApp}
        />
        <div id="main" tabIndex={-1} className="scroll-mt-20 outline-none">{children}</div>
        {/* Native iOS-Push-Registrierung (web-inert; nur in der Capacitor-App aktiv). */}
        {authenticated && <PushRegistrar />}
        <Toaster />
        <CookieBanner isNativeApp={isNativeApp} />
      </body>
    </html>
  );
}
