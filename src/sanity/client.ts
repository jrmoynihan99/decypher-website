import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "./env";

/**
 * Public read client. CDN-cached; freshness is handled by ISR:
 * pages export `revalidate = 86400` as a safety net and the Sanity
 * webhook (`/api/revalidate`) purges paths instantly on publish.
 */
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
});

/**
 * Same client, straight to the API.
 *
 * The CDN serves a stale read for up to a minute after a write, and ISR turns
 * that minute into a day: a page rendered from a stale read caches the stale
 * answer until the next purge. Harmless for copy — the second purge fixes it —
 * but not for the queries that decide whether something EXISTS, where a stale
 * "no" prerenders a 404 or drops a route off a list until tomorrow.
 *
 * Used by the thank-you queries, where both failures are live: a page added
 * for a campaign that 404s, or a `?ty=` that silently falls back to the
 * default because the route list was a minute out of date. They run at build
 * and revalidate time only — these pages are static — so the CDN buys nothing
 * here anyway.
 */
export const freshClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
});
