import type { Creator } from "@/lib/creators";
import { client } from "./client";
import { urlFor } from "./image";
import type {
  CmsJob,
  CmsService,
  CmsTeamMember,
  CmsTestimonial,
  CmsVideoTestimonial,
  PageDoc,
  SiteSettings,
  TestimonialAccent,
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
] as const;

/** "/" stays "/", "services" → "/services". */
export function slugToPath(slug: string): string {
  const clean = slug.replace(/^\/+/, "");
  return clean === "" ? "/" : `/${clean}`;
}

// ── pages ───────────────────────────────────────────────────────────

export async function getPageBySlug(slug: string): Promise<PageDoc | null> {
  return client.fetch(
    `*[_type in $types && slug.current == $slug][0]{
      ...,
      "slug": slug.current
    }`,
    { types: PAGE_TYPES, slug },
  );
}

export async function getAllPageSlugs(): Promise<string[]> {
  return client.fetch(
    `*[_type in $types && defined(slug.current)].slug.current`,
    { types: PAGE_TYPES },
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
      }
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
      name,
      "category": coalesce(category->title, category),
      "group": coalesce(group->title, group),
      description, links[]{ "plat": platform, url }, image
    }`,
  );
  return rows.map(
    (c: RawImageDoc & Omit<Creator, "img" | "cat" | "desc"> & { category: string; description?: string }) => ({
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
      blurb, tags, videoUrl, description
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
    row: "a" | "b";
  }[] = await client.fetch(
    `*[_type == "testimonial"] | order(order asc){
      quote, name, handle, image, followers, category, accent, row
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
  return {
    rowA: rows.filter((t) => t.row === "a").map(toCard),
    rowB: rows.filter((t) => t.row === "b").map(toCard),
  };
}
