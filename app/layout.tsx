import "./globals.css";
import { Inter, Montserrat_Alternates } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shared/app-header";
import { CookieBanner } from "@/components/shared/cookie-banner";
import { PlausibleScript } from "@/components/analytics/plausible-script";
import { getServerSession } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";

// Body / UI: Inter (broad latin coverage, weight 400-900)
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-sans",
  display: "swap"
});

// Display / Headlines: Montserrat Alternates — geometrische Sans mit
// alternativen Buchstaben-Formen, kommt dem KickPact-Wordmark-Stil
// (kantig, geometrisch, modern) am nächsten unter den Google Fonts.
// Alternativen für Test: Orbitron (zu futuristisch), Russo One (zu schmal),
// Sora Black (clean aber generisch), Bebas Neue (zu condensed).
const displayFont = Montserrat_Alternates({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap"
});

export const metadata = {
  title: "KickPact — Performance-Sponsoring für Amateurfußball",
  description:
    "Sponsere deinen Lieblingsverein pro Spielereignis. Weniger als 1 € pro Spieler im Monat.",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "KickPact",
    title: "KickPact — Performance-Sponsoring für Amateurfußball",
    description:
      "Sponsere deinen Lieblingsverein pro Spielereignis. Weniger als 1 € pro Spieler im Monat.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }]
  },
  twitter: {
    card: "summary_large_image"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Session + Identity-basiertes Logo-Routing: eingeloggte User springen vom
  // Logo direkt ins Dashboard (oder /select-role bei Multi-Identity), nicht
  // mehr auf die Marketing-Landing. Bei Auth-Fehler oder unauth.: Default "/".
  const session = await getServerSession().catch(() => null);
  let dashboardHref = "/";
  if (session?.user?.id) {
    try {
      const ids = await getUserIdentities(session.user.id);
      dashboardHref = pickDashboardDestination(ids);
    } catch {
      // Identity-Lookup darf das Layout NIE kippen — fallback auf "/" ist
      // semantisch sinnvoll (User landet im schlimmsten Fall einmal auf der
      // Landing, klickt Login/Profil).
    }
  }
  const authenticated = !!session?.user;

  return (
    <html lang="de" className={`${inter.variable} ${displayFont.variable}`}>
      <head>
        <PlausibleScript />
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
        <AppHeader authenticated={authenticated} dashboardHref={dashboardHref} />
        <div id="main">{children}</div>
        <Toaster />
        <CookieBanner />
      </body>
    </html>
  );
}
