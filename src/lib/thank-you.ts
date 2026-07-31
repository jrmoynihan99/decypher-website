import type { ThankYouRouting } from "@/sanity/types";

/**
 * Where a booking sends people, and how a campaign picks its own page.
 *
 * The client runs paid ads and needs each campaign's conversion to land on its
 * own URL, so the choice is made in the ad's link rather than in the CMS: put
 * `?ty=<route>` on the landing page's URL and that's where the form goes when
 * it's done. Everything else falls back to the page set in Book a Call →
 * Thank You.
 *
 * The parameter is checked against the routes that actually exist rather than
 * pasted into a path. Someone who just booked a call is the last person who
 * should be shown a 404 because of a typo in an ad.
 */

/** Query parameter that picks the thank-you page, e.g. /schedule-team?ty=meta-january. */
export const THANK_YOU_PARAM = "ty";

const BASE = "/thank-you";

/** Bare route — renders the configured default, or built-in copy if there is none. */
export const THANK_YOU_FALLBACK_PATH = BASE;

export function thankYouPath(slug: string): string {
  return `${BASE}/${slug}`;
}

/**
 * @param search  The landing page's query string (window.location.search).
 * @returns A path that is always safe to navigate to.
 */
export function resolveThankYouPath(
  search: string,
  routing: ThankYouRouting,
): string {
  const requested = new URLSearchParams(search).get(THANK_YOU_PARAM)?.trim();
  if (requested && routing.slugs.includes(requested)) {
    return thankYouPath(requested);
  }
  return routing.defaultSlug
    ? thankYouPath(routing.defaultSlug)
    : THANK_YOU_FALLBACK_PATH;
}
