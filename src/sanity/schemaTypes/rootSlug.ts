import type { SlugIsUniqueValidator, SlugValue } from "sanity";

/**
 * Guards for the multi-instance pages that live at the site ROOT — affiliate
 * pages and landing pages. The singleton pages can't collide with anything
 * (their slugs are fixed), but a page the client creates from "+ New" can:
 * a landing page slugged "services" would shadow the real Services page, and
 * one slugged "faq" would never render at all because the code route wins.
 */

/**
 * Routes that aren't Sanity pages but would still shadow (or be shadowed by)
 * one. Every code route under src/app/(site) and src/app belongs here.
 */
export const RESERVED_SLUGS = [
  "studio",
  "portal",
  "api",
  "schedule-team",
  "leaderboard",
  "faq",
  "tax-estimator",
  "thank-you",
  "legal",
  "careers",
  "recap",
  "feedback",
  "discovery-call",
];

/** The reserved-route check, for a slug field's `custom` validation. */
export function notReserved(slug?: SlugValue): true | string {
  const value = slug?.current ?? "";
  if (RESERVED_SLUGS.includes(value)) {
    return `"${value}" is a reserved route and would shadow part of the site.`;
  }
  return true;
}

/**
 * Unique across EVERY slugged document, not just this type — so it catches
 * another landing page, an affiliate page, and a real page like /services.
 */
export const uniqueAcrossPages: SlugIsUniqueValidator = async (slug, context) => {
  const { document, getClient } = context;
  if (!document) return true;
  const id = document._id.replace(/^drafts\./, "");
  const taken = await getClient({ apiVersion: "2024-10-01" }).fetch<boolean>(
    `defined(*[!(_id in [$draft, $published]) && slug.current == $slug][0]._id)`,
    { draft: `drafts.${id}`, published: id, slug },
  );
  return !taken;
};
