import type { Metadata } from "next";
import ThankYouTemplate from "@/components/templates/ThankYouTemplate";
import {
  getSiteSettings,
  getTestimonials,
  getThankYouSharedSections,
  getVideoTestimonials,
} from "@/sanity/queries";
import { withLiveStats } from "@/lib/quickbooks/public-stats";
import type { CmsThankYouPage } from "@/sanity/types";

/**
 * Shared assembly for both thank-you routes — /thank-you/<campaign> and the
 * bare /thank-you fallback — so the two can't drift apart. Identical GROQ calls
 * within one render are deduped by Next's fetch memoization.
 */
export async function renderThankYou(page: CmsThankYouPage | null) {
  // A page that picks its own creator videos already carries them (they come
  // back dereferenced with the document), so the collection read is skipped
  // outright rather than fetched and thrown away.
  const picked = page?.videos ?? [];

  const [settings, shared, testimonials, videos] = await Promise.all([
    getSiteSettings().then(withLiveStats),
    getThankYouSharedSections(),
    getTestimonials(),
    picked.length ? picked : getVideoTestimonials(),
  ]);

  return (
    <ThankYouTemplate
      page={page}
      shared={shared}
      testimonials={testimonials}
      videos={videos}
      stats={settings?.stats ?? []}
    />
  );
}

/**
 * Never indexed. These exist to be landed on straight after booking and to
 * carry a conversion pixel; in search results they are duplicate copies of one
 * another that no one was looking for.
 */
export function thankYouMetadata(page: CmsThankYouPage | null): Metadata {
  const heading = page?.header?.title?.trim();
  return {
    title: `${heading || "Thank you"} — DeCypher Financials`,
    robots: { index: false, follow: false },
  };
}
