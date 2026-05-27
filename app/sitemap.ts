import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/help-center/articles";

/**
 * Dynamische sitemap.xml via Next.js App Router.
 *
 * Statische öffentliche Routen + alle publizierten Help-Center-Artikel.
 * Private Routen (Dashboard, Admin, Auth) werden bewusst ausgelassen.
 * /status ist intern — nicht in der Sitemap.
 *
 * Base-URL aus NEXT_PUBLIC_BASE_URL:
 *   Staging:    https://kickpact.schartl.dev
 *   Production: https://kickpact.com
 *
 * robots.ts blockt Indexierung auf Staging — die Sitemap ist dort technisch
 * ausgeliefert, wird von Google aber ignoriert.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.com"
  ).replace(/\/$/, "");

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

  return [...staticRoutes, ...articleRoutes];
}
