import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000", "localhost:3003"] }
  },
  // Help-Center liest Markdown via fs.readdir aus docs/help-center/articles/.
  // Auf Coolify/Vercel-Builds wird das docs/-Dir NICHT automatisch in den
  // Server-Bundle gepackt → Runtime-500 mit ENOENT. outputFileTracingIncludes
  // explizit hinzufügen damit der Build die Markdown-Files mit ausliefert.
  outputFileTracingIncludes: {
    "/hilfe": ["./docs/help-center/articles/**/*.md"],
    "/hilfe/**/*": ["./docs/help-center/articles/**/*.md"]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**"
      }
    ]
  }
};

export default config;
