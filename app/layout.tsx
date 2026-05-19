import "./globals.css";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shared/app-header";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-sans",
  display: "swap"
});

// Display = Inter Black (weight 900). Setting same variable used by sans;
// `.font-display` is differentiated by weight + letter-spacing, not family.
const interDisplay = Inter({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-display",
  display: "swap"
});

export const metadata = {
  title: "KickPact — Mehr als ein Spiel",
  description: "Performance-basiertes Sponsoring im Amateurfußball"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${interDisplay.variable}`}>
      <body className="font-sans bg-brand-off-white text-brand-night-navy">
        <AppHeader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
