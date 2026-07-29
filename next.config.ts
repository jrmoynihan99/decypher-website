import type { NextConfig } from "next";

/**
 * Permanent redirects from the old GoHighLevel site's URLs.
 *
 * The GHL build used different slugs for four of its six pages, and those URLs
 * are in the client's link-in-bio, past ad creative and whatever Google has
 * indexed. 301s (permanent: true) pass the ranking signal to the new paths
 * instead of dropping it. `/schedule-team` is deliberately absent — it is
 * identical on both sites, and is the CTA target hardcoded in src/lib/tax.ts.
 *
 * `/Our-Team` really was capitalised on the old site, and redirect matching is
 * case-sensitive, so the lowercase spelling is listed separately rather than
 * assumed.
 */
const LEGACY_REDIRECTS = [
  { source: "/home", destination: "/" },
  { source: "/decypher-services", destination: "/services" },
  { source: "/our-creators", destination: "/creators" },
  { source: "/Our-Team", destination: "/team" },
  { source: "/our-team", destination: "/team" },
];

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
  async redirects() {
    return LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: true }));
  },
};

export default nextConfig;
