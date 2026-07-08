import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev-only: lets phones on the local network load HMR/dev resources when
  // browsing the dev server via the machine's LAN IP (ignored in production)
  allowedDevOrigins: ["192.168.1.*"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
};

export default nextConfig;
