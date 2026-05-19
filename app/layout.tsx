import "./globals.css";

export const metadata = {
  title: "KickPact",
  description: "Performance-basiertes Sponsoring im Amateurfußball"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
