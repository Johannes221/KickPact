import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.com";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/preise`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/hilfe`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/status`, lastModified: new Date(), changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/impressum`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/datenschutz`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/agb`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 }
  ];
}
