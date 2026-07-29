import type { Metadata } from "next";

/**
 * Share-card metadata, built whole every time.
 *
 * Next merges metadata *shallowly*: a route that returns an `openGraph` object
 * REPLACES the parent's outright rather than filling in around it. So a page
 * that set only `openGraph.title` silently dropped the inherited image, site
 * name and `twitter:card` — which is exactly how this site shipped `og:image`
 * on no page at all and `twitter:card: summary` on the home page. Every caller
 * goes through here so a partial block can't be spelled.
 *
 * `path` and the image URL are left site-relative on purpose; `metadataBase` in
 * the root layout resolves them to absolute URLs at render.
 */

/** The generated fallback card — see app/opengraph-image.tsx. */
const GENERATED_CARD = "/opengraph-image";

interface SocialInput {
  title?: string;
  description?: string;
  /**
   * Site-relative path this page canonically lives at. Omit for the root
   * layout: a canonical set there would be inherited by every route that
   * doesn't override it, pointing the whole site at one URL.
   */
  path?: string;
  /** Absolute URL of a CMS-supplied share image. Falls back to the generated card. */
  image?: string;
}

export function socialMetadata({
  title,
  description,
  path,
  image,
}: SocialInput): Metadata {
  const images = [{ url: image ?? GENERATED_CARD, width: 1200, height: 630 }];

  return {
    ...(path && { alternates: { canonical: path } }),
    openGraph: {
      type: "website",
      siteName: "DeCypher Financials",
      locale: "en_US",
      ...(path && { url: path }),
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}
