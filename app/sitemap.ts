import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/help-center/articles";
import { listPublicTeamSlugs } from "@/lib/db/queries/sponsor-discover";
import { listVerifiedClubSlugs } from "@/lib/db/queries/club-public-profile";

/**
 * Dynamische sitemap.xml via Next.js App Router.
 *
 * Statische öffentliche Routen + alle publizierten Help-Center-Artikel +
 * öffentliche Team-Profile (/m/<slug>, nur discoverable+verifiziert) +
 * /mannschaften (Discovery).
 * Private Routen (Dashboard, Admin, Auth) werden bewusst ausgelassen.
 * /status ist intern — nicht in der Sitemap.
 *
 * Base-URL aus NEXT_PUBLIC_BASE_URL:
 *   Staging:    https://kickpact.schartl.dev
 *   Production: https://kickpact.com
 *
 * robots.ts blockt Indexierung auf Staging — die Sitemap ist dort technisch
 * ausgeliefert, wird von Google aber ignoriert. Die dynamischen Team-Profile
 * kommen zusätzlich env-gesteuert nur in Production in die Sitemap (kein
 * Leaken von Staging-Testdaten).
 */
// Zur Request-Zeit rendern statt beim Build: die Team-/Club-Slugs unten sind
// DB-Queries. Prerendered bräuchte der BUILD eine erreichbare DB (→ DATABASE_URL
// als Build-Arg, landet im Coolify-Deploy-Log im Klartext) und die Sitemap wäre
// zusätzlich auf den Deploy-Zeitpunkt eingefroren — neue Vereine tauchten erst
// beim nächsten Deploy auf.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.com"
  ).replace(/\/$/, "");
  // An DIESELBE Bedingung wie robots.ts koppeln (NEXT_PUBLIC_SITE_ENV), nicht an
  // einen Exakt-String-Vergleich der Base-URL — sonst fielen die dynamischen
  // Profile bei einer abweichenden Schreibweise (www., Trailing Slash) still aus
  // der Sitemap, während robots sie erlaubt (inkonsistent).
  const isProduction = process.env.NEXT_PUBLIC_SITE_ENV === "production";

  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/preise`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/mannschaften`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/hilfe`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/agb`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/datenschutz`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/impressum`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  // Help-Center-Artikel: nur publizierte (draft-Filter läuft bereits im Loader)
  const articles = await getAllArticles();
  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${baseUrl}/hilfe/${a.frontmatter.category}/${a.frontmatter.slug}`,
    lastModified: a.frontmatter.last_updated
      ? new Date(a.frontmatter.last_updated)
      : now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Öffentliche Team-Profile — nur in Production (Staging-Testdaten gehören
  // nicht in eine Sitemap, auch wenn robots.ts dort ohnehin blockt).
  let teamRoutes: MetadataRoute.Sitemap = [];
  if (isProduction) {
    const slugs = await listPublicTeamSlugs();
    teamRoutes = slugs.map((slug) => ({
      url: `${baseUrl}/m/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  }

  // Öffentliche Vereinsprofile (/v/<slug>, nur verifizierte Clubs) — gleiches
  // Production-Gate wie die Team-Profile.
  let clubRoutes: MetadataRoute.Sitemap = [];
  if (isProduction) {
    const clubSlugs = await listVerifiedClubSlugs();
    clubRoutes = clubSlugs.map((slug) => ({
      url: `${baseUrl}/v/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  }

  return [...staticRoutes, ...articleRoutes, ...teamRoutes, ...clubRoutes];
}
