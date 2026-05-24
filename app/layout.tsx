import "./globals.css";
import { Inter, Montserrat_Alternates } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shared/app-header";
import { PlausibleScript } from "@/components/analytics/plausible-script";

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
  title: "KickPact — Mehr als ein Spiel",
  description: "Performance-basiertes Sponsoring im Amateurfußball"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <AppHeader />
        <div id="main">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
