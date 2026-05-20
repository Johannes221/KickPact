import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000", "localhost:3003"] }
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
