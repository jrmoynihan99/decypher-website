import type { MetadataRoute } from "next";
import { FAQ_PATH, ESTIMATOR_PATH, questionPath } from "@/lib/faq";
import { absoluteUrl } from "@/lib/site-url";
import {
  getAllJobSlugs,
  getAllLegalPageSlugs,
  getAllPageSlugs,
  getFaqSitemapRows,
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
  const [pageSlugs, legalSlugs, jobSlugs, faqRows] = await Promise.all([
    // indexableOnly: landing pages marked "Hide from search engines" (ad-only
    // pages that repeat copy from elsewhere) stay out for the same reason
    getAllPageSlugs({ excludeTypes: [AFFILIATE_TYPE], indexableOnly: true }),
    getAllLegalPageSlugs(),
    getAllJobSlugs(),
    getFaqSitemapRows(),
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

  // Code routes, not Sanity pages, so getAllPageSlugs can't see them.
  const estimator = {
    url: absoluteUrl(ESTIMATOR_PATH),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  };

  // The hub changes whenever any question does.
  const newest = faqRows.reduce<string | null>(
    (max, r) => (!max || r.updatedAt > max ? r.updatedAt : max),
    null,
  );
  const faq = [
    {
      url: absoluteUrl(FAQ_PATH),
      ...(newest && { lastModified: new Date(newest) }),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    ...faqRows.map((r) => ({
      url: absoluteUrl(questionPath(r.slug)),
      lastModified: new Date(r.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  return [...pages, estimator, ...faq, ...jobs, ...legal];
}
