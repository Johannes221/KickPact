import "./globals.css";
import { Inter, Anton } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shared/app-header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

export const metadata = {
  title: "KickPact",
  description: "Performance-basiertes Sponsoring im Amateurfußball"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${anton.variable}`}>
      <body className="font-sans">
        <AppHeader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
