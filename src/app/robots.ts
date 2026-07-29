import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Served at /robots.txt.
 *
 * The disallow list is the set of routes that are reachable but shouldn't be in
 * an index: the client portal (already `robots: noindex` in its layout — this
 * is belt and braces, and stops crawl budget being spent on a wall of 307s to
 * the login), the embedded Sanity Studio, and the API. Everything public is
 * allowed; the sitemap points crawlers at the canonical list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/portal/", "/studio/", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
