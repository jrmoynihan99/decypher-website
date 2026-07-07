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
