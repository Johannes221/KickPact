import type { MetadataRoute } from "next";

/**
 * robots.txt via Next.js App Router.
 *
 * Staging  (NEXT_PUBLIC_SITE_ENV != "production"): Disallow all —
 *   verhindert dass Google Staging-Inhalte indexed.
 * Production: Standard Allow, private Routen geblockt, Sitemap verlinkt.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.com"
  ).replace(/\/$/, "");
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";

  if (!isProd) {
    // Staging: Google soll nichts indexieren
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/admin",
          "/konto",
          "/api/",
          "/select-role",
          "/spieler-opt-out",
          "/season-renewal",
          "/einladung",
          "/team-einladung",
          "/status",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
