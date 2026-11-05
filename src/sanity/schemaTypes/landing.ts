// @sanity/icons v5's package root only exports the lazy `icons` map at
// runtime (its index.d.ts still declares every named icon, so tsc can't
// catch a root import) — named icons have to come from their subpaths.
import { BarChartIcon } from "@sanity/icons/BarChart";
import { BillIcon } from "@sanity/icons/Bill";
import { BulbOutlineIcon } from "@sanity/icons/BulbOutline";
import { CalendarIcon } from "@sanity/icons/Calendar";
import { CommentIcon } from "@sanity/icons/Comment";
import { DocumentVideoIcon } from "@sanity/icons/DocumentVideo";
import { HelpCircleIcon } from "@sanity/icons/HelpCircle";
import { ImageIcon } from "@sanity/icons/Image";
import { OlistIcon } from "@sanity/icons/Olist";
import { PlayIcon } from "@sanity/icons/Play";
import { RocketIcon } from "@sanity/icons/Rocket";
import { StarIcon } from "@sanity/icons/Star";
import { ThListIcon } from "@sanity/icons/ThList";
import { UsersIcon } from "@sanity/icons/Users";
import { defineArrayMember, defineField, defineType } from "sanity";
import { LANDING_DEFAULTS as D } from "@/lib/landing-sections";
import { pageLinkField } from "./pageLink";
import { notReserved, uniqueAcrossPages } from "./rootSlug";

/**
 * Landing pages — the one page type built from a SECTION LIBRARY.
 *
 * Every other page on the site is a fixed template: its sections and their
 * order live in code, because the neural-web meshes span fixed groups of
 * sections. Landing pages trade that for freedom — the client stacks whatever
 * sections a campaign needs, in any order, from Studio — and LandingTemplate
 * takes over the job the templates do by hand: it groups the stack into mesh
 * runs, lets the services map own its own web, and leaves the estimator's wave
 * field alone. See that file before adding a section with its own backdrop.
 *
 * The sections are the site's existing ones (thank-you hero, reviews, video
 * wall, booking form, FAQ, …), not lookalikes, so a fix to the home page's
 * testimonials is a fix here too. Each section's copy is optional wherever the
 * component has a sensible default: the placeholder in each field is exactly
 * what renders when it's left empty.
 *
 * Adding a section type: define it below, add it to SECTION_TYPES (and an
 * insert-menu group), add its shape to LandingSection in sanity/types.ts and a
 * case to LandingTemplate's renderer. A preview image in
 * public/studio-sections/<type>.jpg is optional but makes the "Add section"
 * grid far easier to read.
 */

// ── shared fields ───────────────────────────────────────────────────

const N_HINT =
  "{n} becomes this section's number on the page (01, 02, …), so reordering sections never leaves the numbers out of sequence.";

/** The mono bracket label over a section heading. */
const eyebrowField = (placeholder: string) =>
  defineField({
    name: "eyebrow",
    type: "string",
    placeholder,
    description: `Mono label over the heading. Empty shows the placeholder. ${N_HINT}`,
  });

/** With a placeholder the title is optional (empty renders it); without, required. */
const titleField = (placeholder?: string) =>
  placeholder
    ? defineField({
        name: "title",
        type: "string",
        placeholder,
        description: "Empty shows the placeholder.",
      })
    : defineField({ name: "title", type: "string", validation: (r) => r.required() });

const LINK_HINT =
  'Where the button goes. Empty: this page\'s booking section if it has one, otherwise the consultation page. "#book", "#estimator", "#faq" or "#reviews" jump to that section on this page; "/tax-estimator" or a full https:// URL go elsewhere.';

/**
 * @param whenEmpty What an empty label does: show a placeholder label, fall
 *                  back to the site's consultation button, or show no button.
 */
const ctaFields = (whenEmpty: { placeholder: string } | "consult" | "none") => [
  defineField({
    name: "ctaLabel",
    title: "Button label",
    type: "string",
    ...(typeof whenEmpty === "object"
      ? { placeholder: whenEmpty.placeholder, description: "Empty shows the placeholder." }
      : {
          description:
            whenEmpty === "consult"
              ? "Empty uses the site's consultation button label (Site Settings)."
              : "Empty means no button.",
        }),
  }),
  defineField({
    name: "ctaHref",
    title: "Button link",
    type: "string",
    description: LINK_HINT,
  }),
];

const youtubeField = (opts: { required?: boolean; description: string }) =>
  defineField({
    name: "videoUrl",
    title: "YouTube URL",
    type: "url",
    description: opts.description,
    validation: (r) => (opts.required ? r.required() : r),
  });

/** Preview: the heading if one was written, else the section kind. */
const headingPreview = (kind: string, fallback?: string) => ({
  select: { title: "title", eyebrow: "eyebrow" },
  prepare: ({ title, eyebrow }: { title?: string; eyebrow?: string }) => ({
    title: title || fallback || kind,
    subtitle: eyebrow ? `${kind} · ${eyebrow.replace("{n}", "#")}` : kind,
  }),
});

// ── heroes ──────────────────────────────────────────────────────────

export const sectionHeroVideo = defineType({
  name: "sectionHeroVideo",
  title: "Hero — headline + video",
  type: "object",
  icon: PlayIcon,
  description:
    "Centered headline with an optional video under it. The thank-you pages' hero. Use it first.",
  fields: [
    defineField({
      name: "eyebrow",
      type: "string",
      description:
        'Teal status line over the headline, e.g. "● FREE MASTER CLASS". Empty shows nothing.',
    }),
    defineField({
      name: "title",
      title: "Headline",
      type: "string",
      validation: (r) => r.required(),
      description: "Long headlines are fine — the type sizes down to fit.",
    }),
    defineField({ name: "body", type: "text", rows: 3 }),
    youtubeField({
      description:
        "Optional. The video plays under the headline — the star of the page (a master class, a VSL). Empty makes this a headline-only hero.",
    }),
    ...ctaFields("none"),
    defineField({
      name: "ctaNote",
      title: "Note under the button",
      type: "string",
      description: 'e.g. "Takes 30 seconds to book."',
    }),
  ],
  preview: {
    select: { title: "title", video: "videoUrl" },
    prepare: ({ title, video }) => ({
      title: title || "Hero",
      subtitle: video ? "Hero · headline + video" : "Hero · headline only",
    }),
  },
});

export const sectionHeroImage = defineType({
  name: "sectionHeroImage",
  title: "Hero — headline + image",
  type: "object",
  icon: ImageIcon,
  description:
    "Pitch on the left, a photo on the right with a pull-quote riding on it. The affiliate pages' hero. Use it first.",
  fields: [
    defineField({
      name: "badge",
      type: "string",
      description: 'Pill over the headline, e.g. "Sent by a creator you know". Empty shows none.',
    }),
    defineField({
      name: "headlineLine1",
      title: "Headline line 1",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "headlineLine2",
      title: "Headline line 2 (gradient)",
      type: "string",
      description: "Renders in the brand gradient, so put the punchline here.",
    }),
    defineField({ name: "body", type: "text", rows: 4 }),
    ...ctaFields({ placeholder: D.sectionHeroImage.ctaLabel }),
    defineField({
      name: "ctaNote",
      title: "Note under the button",
      type: "string",
      description: 'e.g. "Takes 30 seconds to book."',
    }),
    defineField({
      name: "image",
      type: "image",
      options: { hotspot: true },
      description: "Portrait (4:5). Empty renders an on-brand placeholder frame.",
      fields: [
        defineField({
          name: "alt",
          title: "Alt text",
          type: "string",
          description: "Who or what is in the photo, for screen readers.",
        }),
      ],
    }),
    defineField({
      name: "quote",
      title: "Quote over the image",
      type: "object",
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({ name: "text", type: "text", rows: 3 }),
        defineField({ name: "attribution", type: "string" }),
      ],
    }),
  ],
  preview: {
    select: { title: "headlineLine1", subtitle: "headlineLine2", media: "image" },
    prepare: ({ title, subtitle, media }) => ({
      title: [title, subtitle].filter(Boolean).join(" ") || "Hero",
      subtitle: "Hero · headline + image",
      media,
    }),
  },
});

// ── proof ───────────────────────────────────────────────────────────

export const sectionStats = defineType({
  name: "sectionStats",
  title: "Stats",
  type: "object",
  icon: BarChartIcon,
  description: "The proof numbers. The values themselves live in Site Settings → Stats.",
  fields: [eyebrowField(D.sectionStats.eyebrow), titleField(D.sectionStats.title)],
  preview: headingPreview("Stats", D.sectionStats.title),
});

export const sectionTestimonials = defineType({
  name: "sectionTestimonials",
  title: "Reviews carousel",
  type: "object",
  icon: StarIcon,
  description:
    "The two scrolling rows of written reviews from the home page. The cards come from the Testimonials collection.",
  fields: [eyebrowField(D.sectionTestimonials.eyebrow), titleField(D.sectionTestimonials.title)],
  preview: headingPreview("Reviews carousel", D.sectionTestimonials.title),
});

export const sectionVideoWall = defineType({
  name: "sectionVideoWall",
  title: "Video testimonials",
  type: "object",
  icon: DocumentVideoIcon,
  description: "A grid of creator testimonial videos — the thank-you pages' video wall.",
  fields: [
    eyebrowField(D.sectionVideoWall.eyebrow),
    titleField(D.sectionVideoWall.title),
    defineField({
      name: "sub",
      title: "Subline",
      type: "text",
      rows: 2,
      description: "Optional mono line under the title.",
    }),
    defineField({
      name: "videos",
      type: "array",
      of: [{ type: "reference", to: [{ type: "videoTestimonial" }] }],
      validation: (r) => r.unique(),
      description:
        "Which videos, in this order — drag to reorder. Empty shows the whole Video Testimonials collection. Long lists are fine: they load a few rows at a time as the visitor scrolls.",
    }),
  ],
  preview: headingPreview("Video testimonials", D.sectionVideoWall.title),
});

export const sectionRoster = defineType({
  name: "sectionRoster",
  title: "Creator roster",
  type: "object",
  icon: UsersIcon,
  description: "Two scrolling rows of creator portraits, with a button to Our Creators.",
  fields: [
    eyebrowField(D.sectionRoster.eyebrow),
    titleField(D.sectionRoster.title),
    defineField({
      name: "creators",
      type: "array",
      of: [{ type: "reference", to: [{ type: "creator" }] }],
      validation: (r) => [
        r.unique(),
        r
          .custom((picked?: unknown[]) =>
            !picked || picked.length === 0 || picked.length >= 12
              ? true
              : "Thin for an infinite carousel — 12 or more (16–24 is the sweet spot) keeps the rows from visibly repeating.",
          )
          .warning(),
      ],
      description:
        "Who appears, split across the two rows. Empty shows the same creators as the home page. Pick 12 or more — fewer visibly repeat.",
    }),
  ],
  preview: headingPreview("Creator roster", D.sectionRoster.title),
});

// ── tools & offers ──────────────────────────────────────────────────

export const sectionEstimator = defineType({
  name: "sectionEstimator",
  title: "Tax estimator",
  type: "object",
  icon: BulbOutlineIcon,
  description:
    "The 60-second tax estimator, lead capture included. The calculator itself isn't editable — it encodes 2026 tax law.",
  fields: [
    eyebrowField(D.sectionEstimator.eyebrow),
    titleField(D.sectionEstimator.title),
    defineField({
      name: "sub",
      title: "Subline",
      type: "text",
      rows: 2,
      placeholder: D.sectionEstimator.sub,
      description: "Empty shows the placeholder.",
    }),
  ],
  preview: headingPreview("Tax estimator", D.sectionEstimator.title),
});

export const sectionVideo = defineType({
  name: "sectionVideo",
  title: "Video feature",
  type: "object",
  icon: PlayIcon,
  description:
    "One big video mid-page that grows as it scrolls into view — the home page's “How we work” video.",
  fields: [
    eyebrowField(D.sectionVideo.eyebrow),
    titleField(),
    defineField({ name: "sub", title: "Subline", type: "text", rows: 2 }),
    youtubeField({ required: true, description: "Any YouTube link — watch, share, or unlisted." }),
  ],
  preview: headingPreview("Video feature"),
});

export const sectionServices = defineType({
  name: "sectionServices",
  title: "Services map",
  type: "object",
  icon: RocketIcon,
  description:
    "The interactive neural map of what DeCypher does (a stacked list on phones). The cards come from the Services collection.",
  fields: [
    eyebrowField(D.sectionServices.eyebrow),
    titleField(D.sectionServices.title),
  ],
  preview: headingPreview("Services map", D.sectionServices.title),
});

export const sectionSteps = defineType({
  name: "sectionSteps",
  title: "Steps",
  type: "object",
  icon: OlistIcon,
  description:
    "Three (or more) numbered cards in a row. Left empty it's the affiliate pages' “what happens on the call”.",
  fields: [
    eyebrowField(D.sectionSteps.eyebrow),
    titleField(D.sectionSteps.title),
    defineField({
      name: "sub",
      title: "Subline",
      type: "string",
      placeholder: D.sectionSteps.sub,
      description: "Mono line under the title. Empty shows the placeholder.",
    }),
    defineField({
      name: "label",
      title: "Card label",
      type: "string",
      placeholder: D.sectionSteps.label,
      description: 'The word after each number — "01 / CALL". Try STEP, WEEK, or MONTH.',
    }),
    defineField({
      name: "steps",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({ name: "title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", type: "text", rows: 3 }),
          ],
          preview: { select: { title: "title", subtitle: "body" } },
        }),
      ],
      description:
        "Empty shows the three call steps (income → what you're missing → your action plan). Three reads best; they wrap in rows of three.",
    }),
  ],
  preview: headingPreview("Steps", D.sectionSteps.title),
});

export const sectionValueStack = defineType({
  name: "sectionValueStack",
  title: "Value stack",
  type: "object",
  icon: BillIcon,
  description:
    "An itemized receipt: everything included, priced line by line and struck through, then the total that's actually due.",
  fields: [
    eyebrowField(D.sectionValueStack.eyebrow),
    titleField(),
    defineField({
      name: "badge",
      type: "string",
      description: 'Pill in the receipt\'s header, e.g. "VIP INCLUDED". Empty shows none.',
    }),
    defineField({
      name: "items",
      title: "Line items",
      type: "array",
      validation: (r) => r.min(1),
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({ name: "label", type: "string", validation: (r) => r.required() }),
            defineField({ name: "sublabel", type: "string" }),
            defineField({
              name: "price",
              type: "string",
              validation: (r) => r.required(),
              description: 'Shown struck through, exactly as typed, e.g. "$500.00".',
            }),
          ],
          preview: { select: { title: "label", subtitle: "price" } },
        }),
      ],
    }),
    defineField({ name: "subtotal", type: "string", description: 'Struck-through sum, e.g. "$947.00". Not calculated — type it.' }),
    defineField({ name: "totalLabel", type: "string", placeholder: D.sectionValueStack.totalLabel }),
    defineField({ name: "totalValue", type: "string", description: 'e.g. "$0.00".' }),
    defineField({ name: "footnote", type: "string", description: "Mono line under the total." }),
    defineField({
      name: "closingLine",
      type: "string",
      description: 'Mono line under the receipt, e.g. "// NO CARD, NO TRIAL". Empty shows none.',
    }),
  ],
  preview: headingPreview("Value stack"),
});

// ── conversion ──────────────────────────────────────────────────────

export const sectionBooking = defineType({
  name: "sectionBooking",
  title: "Book a call",
  type: "object",
  icon: CalendarIcon,
  description:
    "The real booking form from Book a Call, with the pitch beside it. Buttons left empty elsewhere on the page jump here.",
  fields: [
    eyebrowField(D.sectionBooking.eyebrow),
    titleField(D.sectionBooking.title),
    defineField({
      name: "body",
      type: "text",
      rows: 3,
      placeholder: D.sectionBooking.body,
      description: "Empty shows the placeholder.",
    }),
    defineField({
      name: "showStats",
      title: "Show the stats beside the form",
      type: "boolean",
      initialValue: true,
      description: "Wide screens only — on a phone they'd push the form off the screen.",
    }),
    defineField({
      name: "callType",
      title: "Which call",
      type: "string",
      initialValue: "standard",
      options: {
        layout: "radio",
        list: [
          { value: "standard", title: "Free consultation — asks income and routes the call, like Book a Call" },
          { value: "referral", title: "Referral discovery call — no income question, like the affiliate pages" },
        ],
      },
    }),
    defineField({
      name: "thankYou",
      title: "Thank you page",
      type: "reference",
      to: [{ type: "thankYouPage" }],
      description:
        "Where people land once they've booked — pick this campaign's own page so its conversion pixel fires there. Empty uses the page set in Book a Call. A ?ty=<route> on the ad link still wins over both.",
    }),
  ],
  preview: headingPreview("Book a call", D.sectionBooking.title),
});

export const sectionFaq = defineType({
  name: "sectionFaq",
  title: "FAQ",
  type: "object",
  icon: HelpCircleIcon,
  description: "Questions from the Creator Tax FAQ, each opening to its short answer.",
  fields: [
    eyebrowField(D.sectionFaq.eyebrow),
    titleField(D.sectionFaq.title),
    defineField({
      name: "sub",
      title: "Subline",
      type: "string",
      placeholder: D.sectionFaq.sub,
      description: "Empty shows the placeholder.",
    }),
    defineField({
      name: "questions",
      type: "array",
      of: [{ type: "reference", to: [{ type: "faqQuestion" }] }],
      validation: (r) => r.unique().max(12),
      description:
        "Picked from the Creator Tax FAQ, in this order — choose the ones this page's visitor is actually asking. Empty shows the home page's picks (Site Settings → FAQ). Five or six reads well.",
    }),
  ],
  preview: {
    select: { title: "title", q0: "questions.0.question", count: "questions" },
    prepare: ({ title, q0, count }) => ({
      title: title || D.sectionFaq.title,
      subtitle: Array.isArray(count) && count.length
        ? `FAQ · ${count.length} picked${q0 ? ` — “${q0}”…` : ""}`
        : "FAQ · the home page's picks",
    }),
  },
});

export const sectionCta = defineType({
  name: "sectionCta",
  title: "Closing CTA",
  type: "object",
  icon: CommentIcon,
  description: "Big headline and one button. The usual last section.",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "body", type: "text", rows: 3 }),
    ...ctaFields("consult"),
    defineField({
      name: "readout",
      type: "string",
      description: "Mono line under the button, e.g. // MONTHLY MODEL — CANCEL ANYTIME.",
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({ title: title || "Closing CTA", subtitle: "Closing CTA" }),
  },
});

/** Every section, in the order the "Add section" menu lists them. */
export const SECTION_TYPES = [
  sectionHeroVideo,
  sectionHeroImage,
  sectionStats,
  sectionTestimonials,
  sectionVideoWall,
  sectionRoster,
  sectionEstimator,
  sectionVideo,
  sectionServices,
  sectionSteps,
  sectionValueStack,
  sectionBooking,
  sectionFaq,
  sectionCta,
];

const INSERT_GROUPS = [
  { name: "hero", title: "Heroes", of: ["sectionHeroVideo", "sectionHeroImage"] },
  {
    name: "proof",
    title: "Proof",
    of: ["sectionStats", "sectionTestimonials", "sectionVideoWall", "sectionRoster"],
  },
  {
    name: "content",
    title: "Tools & content",
    of: ["sectionEstimator", "sectionVideo", "sectionServices", "sectionSteps", "sectionValueStack"],
  },
  { name: "convert", title: "Conversion", of: ["sectionBooking", "sectionFaq", "sectionCta"] },
];

// ── the page ────────────────────────────────────────────────────────

const LANDING_GROUPS = [
  { name: "sections", title: "Sections", default: true },
  { name: "meta", title: "Route, SEO & Tracking" },
];

const HERO_TYPES = new Set(["sectionHeroVideo", "sectionHeroImage"]);

/** A random array key — Studio needs one on every item, initial values included. */
const key = () => Math.random().toString(36).slice(2, 10);

export const landingPage = defineType({
  name: "landingPage",
  title: "Landing Page",
  type: "document",
  icon: ThListIcon,
  groups: LANDING_GROUPS,
  // A new page opens with a working skeleton rather than a blank list, so the
  // first thing the client sees is a page to edit, not a menu to learn.
  initialValue: () => ({
    hideFromSearch: false,
    sections: [
      { _key: key(), _type: "sectionHeroVideo" },
      { _key: key(), _type: "sectionTestimonials" },
      { _key: key(), _type: "sectionBooking", showStats: true, callType: "standard" },
      { _key: key(), _type: "sectionFaq" },
    ],
  }),
  fields: [
    pageLinkField({ groups: LANDING_GROUPS }),
    defineField({
      name: "title",
      title: "Name",
      type: "string",
      group: "meta",
      validation: (r) => r.required(),
      description:
        'What this page is for, e.g. "LP2 — Surprise tax bill". Internal only: it names the page in the Landing Pages list. The browser-tab title is under SEO.',
    }),
    defineField({
      name: "slug",
      title: "Route",
      type: "slug",
      group: "meta",
      validation: (r) =>
        r
          .required()
          .custom(notReserved)
          .custom((slug) =>
            !slug?.current || /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug.current)
              ? true
              : "Letters, numbers and dashes only — no spaces or slashes.",
          ),
      description:
        'URL path, e.g. "tax-bill" → wedecypher.co/tax-bill. Once ads or emails point here, changing it breaks those links.',
      options: { source: "title", maxLength: 64, isUnique: uniqueAcrossPages },
    }),
    defineField({ name: "seo", type: "seoBlock", group: "meta" }),
    defineField({
      name: "hideFromSearch",
      title: "Hide from search engines",
      type: "boolean",
      group: "meta",
      initialValue: false,
      description:
        "On for ad-only pages that repeat copy from elsewhere — they stay reachable by link but Google is asked not to list them, and they're left out of the sitemap. Off for pages meant to be found (an S-Corp guide, a YouTuber page).",
    }),
    defineField({
      name: "trackingCode",
      title: "Page tracking code",
      type: "text",
      rows: 6,
      group: "meta",
      description:
        "Optional. A snippet that should run on this page only (e.g. a ViewContent event), pasted whole, script tags and all. The base pixel for every page goes in Site Settings → Tracking; the booking conversion fires on the thank-you page. Only paste code you got from the ad platform itself.",
    }),
    defineField({
      name: "sections",
      type: "array",
      group: "sections",
      of: SECTION_TYPES.map((t) => defineArrayMember({ type: t.name })),
      options: {
        insertMenu: {
          filter: true,
          groups: INSERT_GROUPS,
          views: [
            { name: "grid", previewImageUrl: (type) => `/studio-sections/${type}.jpg` },
            { name: "list" },
          ],
        },
      },
      validation: (r) => [
        r.required().min(1),
        r
          .custom((sections?: { _type: string }[]) => {
            const first = sections?.[0]?._type;
            return !sections?.length || (first && HERO_TYPES.has(first))
              ? true
              : "Pages usually open with a hero — the first section's heading is the page's H1.";
          })
          .warning(),
      ],
      description:
        "The page, top to bottom. Add sections with the button below, drag the handles to reorder. The background mesh, spacing and section numbers adjust on their own.",
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "slug.current", hidden: "hideFromSearch" },
    prepare: ({ title, subtitle, hidden }) => ({
      title: title ?? "Untitled landing page",
      subtitle: subtitle
        ? `/${subtitle}${hidden ? " · hidden from search" : ""}`
        : "no route set",
    }),
  },
});
