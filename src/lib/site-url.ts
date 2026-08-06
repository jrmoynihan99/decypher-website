/**
 * The site's own absolute origin, no trailing slash.
 *
 * Needed wherever a relative path isn't good enough — `metadataBase`, canonical
 * URLs, OG image URLs, robots/sitemap. Social crawlers and search engines only
 * ever see absolute URLs, so getting this wrong points every share card and
 * every canonical tag at the wrong host.
 *
 * Resolution order:
 *   1. SITE_URL — set it to override, e.g. to test against a preview.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's *production* domain. Note this
 *      is deliberately not VERCEL_URL, which is the per-deployment hostname and
 *      changes on every push; a canonical tag pointing at that would be worse
 *      than useless.
 *   3. The production domain, hardcoded — the correct answer for a static
 *      build with no env at all, and the reason this never returns null.
 *
 * Contrast with slack.ts's portalApplicationsUrl(), which is nullable on
 * purpose: a Slack message can drop a link, but metadata can't drop an origin.
 */
/**
 * Exported for the Studio's Page link field, which can't call siteUrl(): it runs
 * in the browser, where none of the env vars above exist, and the whole point of
 * that field is to hand someone the public link — never a preview host.
 */
export const PRODUCTION_ORIGIN = "https://wedecypher.co";

export function siteUrl(): string {
  const raw =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    PRODUCTION_ORIGIN;

  // SITE_URL is typed into a dashboard by a person, so tolerate the two ways
  // it gets written wrong. A bare "wedecypher.co" matters most: the root
  // layout does `new URL(siteUrl())` for metadataBase, and an origin with no
  // scheme throws there — turning a typo into a failed production build.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Absolute URL for a site-relative path. `absoluteUrl("/team")` → origin + /team. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
