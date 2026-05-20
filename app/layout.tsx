import "./globals.css";
import { Inter, Montserrat_Alternates } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shared/app-header";

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
      <body className="font-sans bg-brand-off-white text-brand-night-navy">
        <AppHeader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
