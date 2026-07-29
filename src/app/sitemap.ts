import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import {
  getAllJobSlugs,
  getAllLegalPageSlugs,
  getAllPageSlugs,
  slugToPath,
} from "@/sanity/queries";

// Rebuilt on the same daily cadence as the pages it lists.
export const revalidate = 86400;

/**
 * Served at /sitemap.xml, built from Sanity so new job posts and legal pages
 * appear without a deploy.
 *
 * Affiliate pages are excluded on purpose. They share PAGE_TYPES with the six
 * real pages (so getAllPageSlugs returns them), but they are per-partner
 * landing pages built from near-identical copy — submitting a dozen of those
 * invites a duplicate-content read of the whole site. Partners share their link
 * directly; they don't need to be found in search.
 */
const AFFILIATE_TYPE = "affiliatePage";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [pageSlugs, legalSlugs, jobSlugs] = await Promise.all([
    getAllPageSlugs({ excludeTypes: [AFFILIATE_TYPE] }),
    getAllLegalPageSlugs(),
    getAllJobSlugs(),
  ]);

  const pages = pageSlugs.map((slug) => {
    const path = slugToPath(slug);
    return {
      url: absoluteUrl(path),
      changeFrequency: "weekly" as const,
      // The home page is the one crawlers should treat as most important;
      // everything else sits a step below it.
      priority: path === "/" ? 1 : 0.8,
    };
  });

  const jobs = jobSlugs.map((slug) => ({
    url: absoluteUrl(`/careers/${slug}`),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const legal = legalSlugs.map((slug) => ({
    url: absoluteUrl(`/legal/${slug}`),
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));

  return [...pages, ...jobs, ...legal];
}
