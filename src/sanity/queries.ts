import type { Creator } from "@/lib/creators";
import { client, freshClient } from "./client";
import { urlFor } from "./image";
import type {
  CmsFaqHub,
  CmsFaqPage,
  CmsFaqQuestion,
  CmsJob,
  CmsLeaderboardPage,
  CmsLegalPage,
  CmsResource,
  CmsResourceCategory,
  CmsService,
  CmsTeamMember,
  CmsTestimonial,
  CmsThankYouPage,
  CmsVideoTestimonial,
  LandingPageDoc,
  PageDoc,
  SectionHeroImage,
  SiteSettings,
  TestimonialAccent,
  ThankYouRouting,
  ThankYouSharedSections,
} from "./types";

// Keep in sync with the copy in schemaTypes/pages.ts — this one drives the GROQ
// fetch, that one drives the schema. A type missing here 404s at the route.
export const PAGE_TYPES = [
  "homePage",
  "servicesPage",
  "creatorsPage",
  "teamPage",
  "schedulePage",
  "careersPage",
  "affiliatePage",
  "landingPage",
] as const;

/** "/" stays "/", "services" → "/services". */
export function slugToPath(slug: string): string {
  const clean = slug.replace(/^\/+/, "");
  return clean === "" ? "/" : `/${clean}`;
}

// ── pages ───────────────────────────────────────────────────────────

/**
 * Page docs come back with a blanket `...` spread — every template reads its
 * own named fields. Landing pages are the exception: their sections hold
 * references (FAQ picks, creator videos, the thank-you page), so those are
 * dereferenced here, in the one query, rather than by a second round trip per
 * section type. Unrenderable picks — a deleted question, a video with no URL —
 * are dropped rather than handed to the section to trip over.
 *
 * freshClient, not the CDN: this read decides whether a route EXISTS, and the
 * client creates landing and affiliate pages minutes before the link goes out.
 * A stale CDN "no" there gets frozen into a 404 for a day (see client.ts and
 * the affiliate-page notes). It only runs at build and revalidate time — the
 * pages are static — so the CDN bought nothing anyway.
 */
export async function getPageBySlug(slug: string): Promise<PageDoc | null> {
  const page: PageDoc | null = await freshClient.fetch(
    `*[_type in $types && slug.current == $slug][0]{
      ...,
      "slug": slug.current,
      _type == "landingPage" => {
        "sections": sections[]{
          ...,
          _type == "sectionVideoWall" => {
            // parenthesised: after []-> a trailing filter maps over each item
            // instead of filtering the list, and leaves nulls behind
            "videos": (videos[]->{ name, "handle": coalesce(handle, ""), videoUrl })[defined(videoUrl)]
          },
          _type == "sectionFaq" => {
            "questions": (questions[]->{
              "slug": slug.current, question, shortAnswer
            })[defined(slug) && defined(question)]
          },
          _type == "sectionBooking" => {
            "thankYouSlug": thankYou->slug.current
          },
          _type == "sectionHeroImage" => {
            "imageAlt": image.alt
          }
        }
      }
    }`,
    { types: PAGE_TYPES, slug },
  );
  return page?._type === "landingPage" ? withLandingImages(page) : page;
}

/**
 * Hero images arrive as raw asset refs; the section wants a URL. Cropped to the
 * frame's 4:5 here so the hotspot the editor set decides what survives the crop
 * — the frame's object-cover would otherwise centre it blindly.
 */
function withLandingImages(page: LandingPageDoc): LandingPageDoc {
  return {
    ...page,
    sections: (page.sections ?? []).map((s) => {
      if (s._type !== "sectionHeroImage") return s;
      const raw = (s as SectionHeroImage & { image?: { asset?: unknown } }).image;
      return {
        ...s,
        imageUrl: raw?.asset
          ? urlFor(raw).width(920).height(1150).fit("crop").url()
          : undefined,
      };
    }),
  };
}

/**
 * Every routable page slug. `excludeTypes` and `indexableOnly` narrow the set
 * without changing routing — the sitemap uses them to leave affiliate pages and
 * landing pages marked "Hide from search engines" out of search, while
 * generateStaticParams still prerenders them.
 */
export async function getAllPageSlugs(
  opts: { excludeTypes?: readonly string[]; indexableOnly?: boolean } = {},
): Promise<string[]> {
  const types = PAGE_TYPES.filter(
    (t) => !opts.excludeTypes?.includes(t),
  );
  return freshClient.fetch(
    `*[_type in $types && defined(slug.current) && ($all || hideFromSearch != true)].slug.current`,
    { types, all: !opts.indexableOnly },
  );
}

// ── portal resources ────────────────────────────────────────────────

/**
 * The staff Tools Hub's PDF library: every category in hub order, each with
 * its resources. A resource whose file is missing (an upload that never
 * finished, a deleted asset) is dropped rather than rendered as a dead card.
 *
 * Straight to the API and never cached: the portal is dynamic, the Studio is
 * where these are edited, and a PDF someone just uploaded should be on the
 * hub on the next load, not in a minute.
 */
export async function getPortalResources(): Promise<CmsResourceCategory[]> {
  type RawResource = {
    _id: string;
    title?: string;
    description?: string;
    url?: string;
    filename?: string;
    size?: number;
    mimeType?: string;
  };
  type RawCategory = { _id: string; title?: string; description?: string; resources?: RawResource[] };
  const rows: RawCategory[] = await freshClient.fetch(
    `*[_type == "resourceCategory"] | order(order asc, title asc) {
      _id, title, description,
      "resources": *[_type == "resource" && references(^._id)] | order(coalesce(order, 9999) asc, title asc) {
        _id, title, description,
        "url": file.asset->url,
        "filename": file.asset->originalFilename,
        "size": file.asset->size,
        "mimeType": file.asset->mimeType
      }
    }`,
    {},
    { cache: "no-store" },
  );
  return (rows ?? []).map((c) => ({
    id: c._id,
    title: c.title ?? "Untitled",
    description: c.description ?? "",
    resources: (c.resources ?? []).flatMap((r): CmsResource[] =>
      r.url
        ? [
            {
              id: r._id,
              title: r.title ?? r.filename ?? "Untitled",
              description: r.description ?? "",
              url: r.url,
              filename: r.filename ?? "document.pdf",
              size: typeof r.size === "number" ? r.size : null,
              mimeType: r.mimeType ?? "application/pdf",
            },
          ]
        : [],
    ),
  }));
}

// ── thank-you pages ─────────────────────────────────────────────────

/**
 * Not in PAGE_TYPES on purpose: these route under /thank-you/ rather than at
 * the site root, so they get their own route and their own fetches — same
 * arrangement as the legal pages.
 *
 * All four read through freshClient rather than the CDN. A campaign page is
 * typically created minutes before the ad goes live, which is exactly the
 * window where a CDN read is stale — and a stale answer here doesn't self
 * correct, it gets frozen into the ISR cache. See client.ts.
 */
export async function getThankYouPageBySlug(
  slug: string,
): Promise<CmsThankYouPage | null> {
  // Dereferenced picks come back one of three ways: a whole video, a null (the
  // referenced document was deleted, or only ever existed as a draft), or a row
  // missing the required URL. Only the first is renderable.
  type RawVideo = { name?: string; handle?: string; videoUrl?: string } | null;
  const page:
    | (Omit<CmsThankYouPage, "videos"> & { videos?: RawVideo[] })
    | null = await freshClient.fetch(
    `*[_type == "thankYouPage" && slug.current == $slug][0]{
      title, "slug": slug.current, header, showHeroVideo, video, trackingCode,
      "videos": videos[]->{ name, handle, videoUrl }
    }`,
    { slug },
  );
  if (!page) return null;
  return {
    ...page,
    // Drop the unrenderable ones rather than letting one stale pick take the
    // wall down — the page is the last step of a booking, not a place to fail.
    videos: (page.videos ?? []).flatMap((v) =>
      v?.videoUrl
        ? [{ name: v.name ?? "", handle: v.handle ?? "", videoUrl: v.videoUrl }]
        : [],
    ),
  };
}

export async function getAllThankYouSlugs(): Promise<string[]> {
  return freshClient.fetch(
    `*[_type == "thankYouPage" && defined(slug.current)].slug.current`,
  );
}

/** The headings shared by every thank-you page — see ThankYouSharedSections. */
export async function getThankYouSharedSections(): Promise<ThankYouSharedSections> {
  const res: ThankYouSharedSections | null = await freshClient.fetch(
    `*[_type == "schedulePage"][0]{
      videoWallSection, statsSection, testimonialsSection
    }`,
  );
  return res ?? {};
}

/**
 * Both halves of the booking form's redirect in one round trip: the fallback
 * page and the set of routes a `?ty=` parameter is allowed to name.
 */
export async function getThankYouRouting(): Promise<ThankYouRouting> {
  const res: Partial<ThankYouRouting> | null = await freshClient.fetch(
    `{
      "defaultSlug": *[_type == "schedulePage"][0].thankYou->slug.current,
      "slugs": *[_type == "thankYouPage" && defined(slug.current)].slug.current
    }`,
  );
  return {
    defaultSlug: res?.defaultSlug ?? null,
    slugs: res?.slugs ?? [],
  };
}

// ── legal pages ─────────────────────────────────────────────────────

/**
 * Not in PAGE_TYPES on purpose: legal pages route under /legal/ rather than at
 * the site root, so they get their own route and their own fetch rather than
 * sharing the [...slug] catch-all.
 */
/**
 * The leaderboard page's content shell. A singleton with a fixed route, so no
 * slug — and deliberately NOT in PAGE_TYPES, since /leaderboard is its own
 * route rather than a catch-all slug.
 *
 * The standings themselves come from Firestore (lib/sales/leaderboard.ts);
 * this is only the wrapper copy and the creator post spotlights.
 */
export async function getLeaderboardPage(): Promise<CmsLeaderboardPage | null> {
  return client.fetch(
    `*[_type == "leaderboardPage"][0]{
      title, seo, header, hawaiiSection, hawaiiEmpty,
      standingsSection, riseSection,
      spotlights[]{ name, postUrl, caption },
      cta
    }`,
  );
}

export async function getLegalPageBySlug(
  slug: string,
): Promise<CmsLegalPage | null> {
  return client.fetch(
    `*[_type == "legalPage" && slug.current == $slug][0]{
      title, "slug": slug.current, eyebrow, effectiveDate, body, seo
    }`,
    { slug },
  );
}

export async function getAllLegalPageSlugs(): Promise<string[]> {
  return client.fetch(
    `*[_type == "legalPage" && defined(slug.current)].slug.current`,
  );
}

// ── Creator Tax FAQ ─────────────────────────────────────────────────

/**
 * All four read through freshClient, like the thank-you queries: they run at
 * build and revalidate time only (the FAQ pages are static), and a stale CDN
 * read of a just-published question would freeze a 404 or a missing hub entry
 * into the ISR cache until tomorrow. See client.ts.
 */

const FAQ_PAGE_PROJECTION = `{
  eyebrow, title, intro, author, generalNote,
  whereAreYou[]{ situation, "question": question->{ "slug": slug.current, question } },
  cta, disclaimer, footerLine, seo
}`;

export async function getFaqHub(): Promise<CmsFaqHub> {
  const hub: CmsFaqHub | null = await freshClient.fetch(
    `{
      "page": *[_type == "faqPage"][0]${FAQ_PAGE_PROJECTION},
      "categories": *[_type == "faqCategory"] | order(order asc, title asc) {
        "id": _id, title,
        "questions": *[_type == "faqQuestion" && category._ref == ^._id && defined(slug.current)]
          | order(coalesce(order, 9999) asc, question asc)
          { "slug": slug.current, question, shortAnswer }
      }[count(questions) > 0],
      "updatedAt": *[_type in ["faqQuestion", "faqPage"]] | order(_updatedAt desc)[0]._updatedAt
    }`,
  );
  return {
    page: hub?.page ?? null,
    categories: hub?.categories ?? [],
    updatedAt: hub?.updatedAt ?? null,
  };
}

/** A question plus the FAQ page copy its page needs (byline, CTAs, footer). */
export async function getFaqQuestionBySlug(
  slug: string,
): Promise<{ question: CmsFaqQuestion | null; page: CmsFaqPage | null }> {
  const res = await freshClient.fetch(
    `{
      "question": *[_type == "faqQuestion" && slug.current == $slug][0]{
        "slug": slug.current, question, shortAnswer, body,
        "nextStep": coalesce(nextStep, "booking"),
        "updatedAt": _updatedAt,
        "category": category->title,
        // parenthesised: after []-> a trailing filter maps over each item
        // instead of filtering the list, and leaves nulls behind
        "related": (related[]->{ "slug": slug.current, question })[defined(slug)]
      },
      "page": *[_type == "faqPage"][0]${FAQ_PAGE_PROJECTION}
    }`,
    { slug },
  );
  return { question: res?.question ?? null, page: res?.page ?? null };
}

export async function getAllFaqSlugs(): Promise<string[]> {
  return freshClient.fetch(
    `*[_type == "faqQuestion" && defined(slug.current)].slug.current`,
  );
}

/** For the sitemap: every question with its own last-modified date. */
export async function getFaqSitemapRows(): Promise<{ slug: string; updatedAt: string }[]> {
  return freshClient.fetch(
    `*[_type == "faqQuestion" && defined(slug.current)]{ "slug": slug.current, "updatedAt": _updatedAt }`,
  );
}

// ── site settings ───────────────────────────────────────────────────

export async function getSiteSettings(): Promise<SiteSettings | null> {
  return client.fetch(
    `*[_type == "siteSettings"][0]{
      ...,
      "logo": logo.asset->{
        url,
        "width": metadata.dimensions.width,
        "height": metadata.dimensions.height
      },
      // parenthesised: after []-> a trailing filter maps over each item
      // instead of filtering the list, and leaves nulls behind
      "featuredFaqs": (featuredFaqs[]->{
        "slug": slug.current, question, shortAnswer
      })[defined(slug) && defined(question)],
      "faqCount": count(*[_type == "faqQuestion" && defined(slug.current)])
    }`,
  );
}

// ── collections ─────────────────────────────────────────────────────

interface RawImageDoc {
  image: object;
}

export async function getCreators(): Promise<Creator[]> {
  // category/group are references to taxonomy docs; coalesce keeps legacy
  // string values working until migrate-creator-taxonomies.mjs has run
  const rows = await client.fetch(
    `*[_type == "creator"] | order(order asc){
      "id": _id,
      name,
      "category": coalesce(category->title, category),
      "group": coalesce(group->title, group),
      description, links[]{ "plat": platform, url }, image
    }`,
  );
  return rows.map(
    (c: RawImageDoc & Omit<Creator, "img" | "cat" | "desc"> & { category: string; description?: string }) => ({
      id: c.id,
      name: c.name,
      cat: c.category,
      group: c.group,
      desc: c.description ?? "",
      links: c.links ?? [],
      img: urlFor(c.image).width(600).url(),
    }),
  );
}

export async function getTeam(): Promise<CmsTeamMember[]> {
  const rows = await client.fetch(
    `*[_type == "teamMember"] | order(order asc){
      name, tag, role, tier, codename, image
    }`,
  );
  return rows.map(
    (m: RawImageDoc & Omit<CmsTeamMember, "img">) => ({
      name: m.name,
      tag: m.tag ?? "",
      role: m.role,
      tier: m.tier,
      codename: m.codename ?? null,
      img: urlFor(m.image).width(900).url(),
    }),
  );
}

export async function getServices(): Promise<CmsService[]> {
  const rows = await client.fetch(
    `*[_type == "service"] | order(order asc){
      order, title, promise, body, chips, nodeTag, imgLabel, image
    }`,
  );
  return rows.map(
    (s: Partial<RawImageDoc> & Omit<CmsService, "num" | "img">) => ({
      order: s.order,
      num: String(s.order).padStart(2, "0"),
      title: s.title,
      promise: s.promise,
      body: s.body,
      chips: s.chips ?? undefined,
      nodeTag: s.nodeTag,
      imgLabel: s.imgLabel ?? undefined,
      img: s.image ? urlFor(s.image).width(1400).url() : undefined,
    }),
  );
}

export async function getJobs(): Promise<CmsJob[]> {
  const rows: (CmsJob & { slug?: string; tags?: string[] })[] = await client.fetch(
    `*[_type == "jobOpening"] | order(order asc){
      title, "slug": slug.current, department, location, type, comp, blurb, tags
    }`,
  );
  return rows.map((j) => ({ ...j, slug: j.slug ?? "", tags: j.tags ?? [] }));
}

/** Full job document — the detail page's fetch, including the rich description. */
export async function getJobBySlug(slug: string): Promise<CmsJob | null> {
  const row: (CmsJob & { tags?: string[] }) | null = await client.fetch(
    `*[_type == "jobOpening" && slug.current == $slug][0]{
      title, "slug": slug.current, department, location, type, comp,
      blurb, tags, videoUrl, description, thankYou
    }`,
    { slug },
  );
  return row ? { ...row, tags: row.tags ?? [] } : null;
}

export async function getAllJobSlugs(): Promise<string[]> {
  return client.fetch(
    `*[_type == "jobOpening" && defined(slug.current)].slug.current`,
  );
}

/**
 * The creators picked for Home's roster carousel, in order — the fallback for
 * a landing page's roster section that picks none of its own.
 */
export async function getHomeRosterRefs(): Promise<string[]> {
  const refs: string[] | null = await client.fetch(
    `*[_id == "homePage"][0].rosterCreators[]._ref`,
  );
  return refs ?? [];
}

export async function getVideoTestimonials(): Promise<CmsVideoTestimonial[]> {
  const rows: { name: string; handle?: string; videoUrl: string }[] =
    await client.fetch(
      `*[_type == "videoTestimonial"] | order(order asc){
        name, handle, videoUrl
      }`,
    );
  return rows.map((v) => ({ ...v, handle: v.handle ?? "" }));
}

const TESTIMONIAL_ACCENTS: Record<
  TestimonialAccent,
  { accent: string; accentBorder: string }
> = {
  magenta: { accent: "#FF2D78", accentBorder: "rgba(255,45,120,.4)" },
  violet: { accent: "#B06CFF", accentBorder: "rgba(139,43,232,.45)" },
  orange: { accent: "#FF7A4D", accentBorder: "rgba(255,92,46,.45)" },
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export async function getTestimonials(): Promise<{
  rowA: CmsTestimonial[];
  rowB: CmsTestimonial[];
}> {
  const rows: {
    quote: string;
    name: string;
    handle?: string;
    image?: object;
    followers?: string;
    category?: string;
    accent?: TestimonialAccent;
  }[] = await client.fetch(
    `*[_type == "testimonial"] | order(order asc){
      quote, name, handle, image, followers, category, accent
    }`,
  );
  const toCard = (t: (typeof rows)[number]): CmsTestimonial => ({
    quote: t.quote,
    name: t.name,
    handle: t.handle ?? "",
    followers: t.followers ?? "",
    cat: t.category ?? "",
    initials: initialsOf(t.name),
    // the avatar circle renders at 64px; 160 covers 2x screens with crop room
    img: t.image ? urlFor(t.image).width(160).height(160).url() : undefined,
    ...TESTIMONIAL_ACCENTS[t.accent ?? "magenta"],
  });
  // Dealt alternately down the site order instead of read off a per-document
  // `row` field. That field was a required radio defaulting to "a", so every
  // testimonial added after the seed landed in the top row — it reached 60
  // against the bottom row's 3, which stretched that row and (the marquee's
  // pace being track-width / duration) ran it ~20x faster. Alternating keeps
  // the two rows within one card of each other no matter what editors add.
  const cards = rows.map(toCard);
  return {
    rowA: cards.filter((_, i) => i % 2 === 0),
    rowB: cards.filter((_, i) => i % 2 === 1),
  };
}
