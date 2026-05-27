import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kickpact.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/verein/", "/sponsor/", "/api/"]
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
