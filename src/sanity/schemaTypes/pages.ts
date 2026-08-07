import { defineField, defineType } from "sanity";
import { pageLinkField } from "./pageLink";

/**
 * One document type per page template. Section layout and order live in
 * code (the neural-web meshes span fixed groups of sections), but every
 * piece of text and imagery in each section is editable here.
 *
 * The `slug` field is the page's route — the site renders all pages
 * through one catch-all route, so changing a slug changes the URL.
 * (If you do, update any links pointing at it in Site Settings.)
 */

const slugField = defineField({
  name: "slug",
  title: "Route",
  type: "slug",
  validation: (r) => r.required(),
  description: 'URL path for this page. Home is "/", others e.g. "services".',
});

const seoField = defineField({ name: "seo", type: "seoBlock" });

const HOME_GROUPS = [
  { name: "hero", title: "Hero" },
  { name: "stats", title: "Stats" },
  { name: "estimator", title: "Estimator" },
  { name: "video", title: "Video" },
  { name: "roster", title: "Roster" },
  { name: "services", title: "Services" },
  { name: "testimonials", title: "Testimonials" },
  { name: "faq", title: "FAQ" },
  { name: "cta", title: "CTA" },
  { name: "meta", title: "Route & SEO" },
];

export const homePage = defineType({
  name: "homePage",
  title: "Home",
  type: "document",
  groups: HOME_GROUPS,
  fields: [
    pageLinkField({ groups: HOME_GROUPS }),
    defineField({ name: "title", type: "string", initialValue: "Home", group: "meta" }),
    { ...slugField, group: "meta" },
    { ...seoField, group: "meta" },
    defineField({
      name: "hero",
      type: "object",
      group: "hero",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
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
          validation: (r) => r.required(),
        }),
        defineField({ name: "body", type: "text", rows: 3 }),
        defineField({ name: "ctaLabel", title: "Primary button label", type: "string" }),
        defineField({
          name: "secondaryCtaLabel",
          title: "Secondary button label",
          type: "string",
          description: "Scrolls to the stats section.",
        }),
        defineField({
          name: "scrollHint",
          type: "string",
          description: "Mono line at the very bottom of the hero.",
        }),
      ],
    }),
    defineField({
      name: "statsSection",
      title: "Stats heading",
      type: "sectionHeadingBlock",
      group: "stats",
      description: "The stat values themselves live in Site Settings → Stats.",
    }),
    defineField({
      name: "estimatorSection",
      title: "Estimator heading",
      type: "sectionHeadingBlock",
      group: "estimator",
      description: "The calculator itself is not editable — it encodes 2026 tax law.",
    }),
    defineField({
      name: "videoSection",
      type: "object",
      group: "video",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "title", type: "string" }),
        defineField({ name: "sub", title: "Subline", type: "text", rows: 2 }),
        defineField({
          name: "videoUrl",
          title: "YouTube URL",
          type: "url",
          description:
            "Any YouTube link works — watch, share, or embed. Leave empty to show the placeholder frame.",
        }),
      ],
    }),
    defineField({
      name: "rosterSection",
      title: "Roster heading",
      type: "sectionHeadingBlock",
      group: "roster",
      description:
        "{count} in the subline = total creators in the collection.",
    }),
    defineField({
      name: "rosterCreators",
      title: "Roster carousel",
      type: "array",
      group: "roster",
      of: [{ type: "reference", to: [{ type: "creator" }] }],
      description:
        "Who appears in the two scrolling rows. The list is split down the " +
        "middle — first half scrolls one way, second half the other — and each " +
        "row loops forever, so it needs enough faces to fill the screen before " +
        "it comes back around. Pick at least 12; 16–24 looks best. With fewer " +
        "than about 10 the same creators visibly repeat every few seconds. " +
        "Leave empty to fall back to the first 16 by Sort position.",
      validation: (r) => [
        r.unique(),
        r.custom((picked?: unknown[]) =>
          !picked || picked.length === 0 || picked.length >= 12
            ? true
            : "Thin for an infinite carousel — 12 or more (16–24 is the sweet spot) keeps the rows from visibly repeating.",
        ).warning(),
      ],
    }),
    defineField({
      name: "servicesSection",
      type: "object",
      group: "services",
      description:
        "Service cards come from the Services collection. The interaction hint under the title is part of the animation and stays in code.",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "title", type: "string" }),
      ],
    }),
    defineField({
      name: "testimonialsSection",
      title: "Testimonials heading",
      type: "sectionHeadingBlock",
      group: "testimonials",
      description: "The cards come from the Testimonials collection.",
    }),
    defineField({
      name: "faqSection",
      title: "FAQ heading",
      type: "sectionHeadingBlock",
      group: "faq",
      description:
        "The questions themselves live in Site Settings → FAQ, because the affiliate pages show the same list. Editing them there updates every page at once.",
    }),
    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Home" }) },
});

const SERVICES_GROUPS = [
  { name: "header", title: "Header" },
  { name: "cta", title: "CTA" },
  { name: "meta", title: "Route & SEO" },
];

export const servicesPage = defineType({
  name: "servicesPage",
  title: "Services",
  type: "document",
  groups: SERVICES_GROUPS,
  fields: [
    pageLinkField({ groups: SERVICES_GROUPS }),
    defineField({ name: "title", type: "string", initialValue: "Services", group: "meta" }),
    { ...slugField, group: "meta" },
    { ...seoField, group: "meta" },
    defineField({ name: "header", type: "pageHeaderBlock", group: "header" }),
    defineField({
      name: "primaryCtaLabel",
      title: "Primary button label",
      type: "string",
      group: "header",
    }),
    defineField({
      name: "secondaryCtaLabel",
      title: "Secondary button label",
      type: "string",
      group: "header",
      description: "Scrolls to the first service chapter.",
    }),
    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Services" }) },
});

const CREATORS_GROUPS = [
  { name: "header", title: "Header" },
  { name: "cta", title: "CTA" },
  { name: "meta", title: "Route & SEO" },
];

export const creatorsPage = defineType({
  name: "creatorsPage",
  title: "Our Creators",
  type: "document",
  groups: CREATORS_GROUPS,
  fields: [
    pageLinkField({ groups: CREATORS_GROUPS }),
    defineField({ name: "title", type: "string", initialValue: "Our Creators", group: "meta" }),
    { ...slugField, group: "meta" },
    { ...seoField, group: "meta" },
    defineField({
      name: "header",
      type: "pageHeaderBlock",
      group: "header",
      description: "The grid comes from the Creators collection. {count} = total creators.",
    }),
    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Our Creators" }) },
});

const TEAM_GROUPS = [
  { name: "header", title: "Header" },
  { name: "tiers", title: "Tiers" },
  { name: "cta", title: "CTA" },
  { name: "meta", title: "Route & SEO" },
];

export const teamPage = defineType({
  name: "teamPage",
  title: "Our Team",
  type: "document",
  groups: TEAM_GROUPS,
  fields: [
    pageLinkField({ groups: TEAM_GROUPS }),
    defineField({ name: "title", type: "string", initialValue: "Our Team", group: "meta" }),
    { ...slugField, group: "meta" },
    { ...seoField, group: "meta" },
    defineField({
      name: "header",
      type: "pageHeaderBlock",
      group: "header",
      description:
        "Cards come from the Team collection. Tokens: {count} = members, {tiers} = tier count.",
    }),
    defineField({
      name: "tierTaglines",
      type: "object",
      group: "tiers",
      description: "The one-liner next to each tier heading.",
      fields: [
        defineField({ name: "managers", type: "string" }),
        defineField({ name: "seniors", type: "string" }),
        defineField({ name: "staff", type: "string" }),
      ],
    }),
    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Our Team" }) },
});

const SCHEDULE_GROUPS = [
  { name: "hero", title: "Hero" },
  { name: "confirmation", title: "Thank You" },
  { name: "proof", title: "Stats & Reviews" },
  { name: "meta", title: "Route & SEO" },
];

export const schedulePage = defineType({
  name: "schedulePage",
  title: "Book a Call",
  type: "document",
  groups: SCHEDULE_GROUPS,
  fields: [
    pageLinkField({ groups: SCHEDULE_GROUPS }),
    defineField({ name: "title", type: "string", initialValue: "Book a Call", group: "meta" }),
    { ...slugField, group: "meta" },
    { ...seoField, group: "meta" },
    defineField({
      name: "hero",
      type: "object",
      group: "hero",
      description: "The form fields themselves stay in code.",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "title", type: "string" }),
        defineField({ name: "body", type: "text", rows: 3 }),
      ],
    }),
    defineField({
      name: "thankYou",
      title: "Thank you page",
      type: "reference",
      to: [{ type: "thankYouPage" }],
      group: "confirmation",
      description:
        "Where this form sends people once they've booked. Ad links can override it per campaign by adding ?ty=<route> — e.g. /schedule-team?ty=meta-january lands on /thank-you/meta-january. This is the page used when there's no such parameter, or when the one in the link doesn't match a page. Edit the pages themselves under Thank You Pages.",
    }),
    defineField({
      name: "videoWallSection",
      title: "Video wall heading",
      type: "sectionHeadingBlock",
      group: "confirmation",
      description:
        "The heading over the creator-video grid, on EVERY thank-you page — set once here rather than retyped on each one. The videos come from the Video Testimonials collection.",
    }),
    defineField({
      name: "statsSection",
      title: "Stats heading",
      type: "sectionHeadingBlock",
      group: "proof",
      description:
        "Shown here and on every thank-you page. Stat values live in Site Settings → Stats.",
    }),
    defineField({
      name: "testimonialsSection",
      title: "Testimonials heading",
      type: "sectionHeadingBlock",
      group: "proof",
      description: "Shown here and on every thank-you page.",
    }),
  ],
  preview: { prepare: () => ({ title: "Book a Call" }) },
});

const CAREERS_GROUPS = [
  { name: "header", title: "Header" },
  { name: "openings", title: "Openings" },
  { name: "why", title: "Why DeCypher" },
  { name: "cta", title: "CTA" },
  { name: "meta", title: "Route & SEO" },
];

export const careersPage = defineType({
  name: "careersPage",
  title: "Careers",
  type: "document",
  groups: CAREERS_GROUPS,
  fields: [
    pageLinkField({ groups: CAREERS_GROUPS }),
    defineField({ name: "title", type: "string", initialValue: "Careers", group: "meta" }),
    { ...slugField, group: "meta" },
    { ...seoField, group: "meta" },
    defineField({
      name: "header",
      type: "pageHeaderBlock",
      group: "header",
      description: "The role cards come from the Openings collection. {count} = open roles.",
    }),
    defineField({
      name: "openingsSection",
      title: "Openings heading",
      type: "sectionHeadingBlock",
      group: "openings",
    }),
    defineField({
      name: "noOpenings",
      title: "Empty state",
      type: "text",
      rows: 2,
      group: "openings",
      description: "Shown when the Openings collection is empty.",
    }),
    defineField({
      name: "whySection",
      title: "Why DeCypher heading",
      type: "sectionHeadingBlock",
      group: "why",
    }),
    defineField({
      name: "perks",
      type: "array",
      group: "why",
      description: "The reason cards under the Why DeCypher heading.",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "tag",
              type: "string",
              description: 'Mono node label on the card, e.g. "REMOTE_FIRST.ENV".',
            }),
            defineField({ name: "title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", type: "text", rows: 3 }),
          ],
          preview: { select: { title: "title", subtitle: "tag" } },
        },
      ],
    }),
    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Careers" }) },
});

/**
 * Affiliate landing pages — the one page type with MANY documents.
 *
 * Every other page above is a singleton: one document, id fixed to the type
 * name, listed by hand in structure.ts. These are different — the client makes
 * a new one per partner from the Studio's "+ New" button, which is why
 * affiliatePage is deliberately absent from SINGLETONS in sanity.config.ts.
 *
 * That freedom is also the risk. Slugs are root-level (/ugc-foundations, to
 * match the links partners already have in circulation), so a new page slugged
 * "services" would collide with the real Services page and one of them would
 * win at random. Nothing else on the site can hit that, because fixed pages
 * have fixed slugs. Hence the two guards on the slug field below.
 *
 * Only partner-specific content is editable here. The proof stats, the "what
 * happens on the call" steps, the review carousel and the FAQ are all shared
 * and live elsewhere — see AffiliateTemplate. Keeping them out of this form is
 * the point: a new partner page should be a five-minute fill-in, not a rebuild.
 */

/** Routes that aren't Sanity pages but would still shadow (or be shadowed by) one. */
const RESERVED_SLUGS = ["studio", "portal", "api", "schedule-team", "leaderboard"];

const AFFILIATE_GROUPS = [
  { name: "hero", title: "Hero" },
  { name: "value", title: "Value Stack" },
  { name: "quotes", title: "Partner Quotes" },
  { name: "meta", title: "Route & SEO" },
];

export const affiliatePage = defineType({
  name: "affiliatePage",
  title: "Affiliate Page",
  type: "document",
  groups: AFFILIATE_GROUPS,
  fields: [
    pageLinkField({ groups: AFFILIATE_GROUPS }),
    defineField({
      name: "partnerName",
      title: "Partner name",
      type: "string",
      group: "meta",
      validation: (r) => r.required(),
      description:
        'The creator or brand this page is for, e.g. "UGC Foundations". Used in the page chrome and to name this document.',
    }),
    defineField({
      name: "slug",
      title: "Route",
      type: "slug",
      group: "meta",
      validation: (r) =>
        r.required().custom((slug) => {
          const value = slug?.current ?? "";
          if (RESERVED_SLUGS.includes(value)) {
            return `"${value}" is a reserved route and would shadow part of the site.`;
          }
          return true;
        }),
      description:
        'URL path, e.g. "ugc-foundations" → wedecypher.co/ugc-foundations. Changing it breaks any link the partner has already shared.',
      options: {
        source: "partnerName",
        // Guards the collision the singleton pages can't have: this checks every
        // slugged document, so it catches both another affiliate page and a real
        // page like /services.
        isUnique: async (slug, context) => {
          const { document, getClient } = context;
          if (!document) return true;
          const id = document._id.replace(/^drafts\./, "");
          const taken = await getClient({ apiVersion: "2024-10-01" }).fetch<boolean>(
            `defined(*[!(_id in [$draft, $published]) && slug.current == $slug][0]._id)`,
            { draft: `drafts.${id}`, published: id, slug },
          );
          return !taken;
        },
      },
    }),
    { ...seoField, group: "meta" },
    defineField({
      name: "calendlyEvent",
      title: "Calendly event (advanced)",
      type: "string",
      group: "meta",
      description:
        'Leave empty — every affiliate page books the shared "DeCypher Affiliate" call. Only set this if this partner gets their own Calendly event and you want their bookings tracked separately. Paste the event key, not the URL.',
    }),
    defineField({
      name: "hero",
      type: "object",
      group: "hero",
      fields: [
        defineField({
          name: "badge",
          type: "string",
          validation: (r) => r.required(),
          description: 'Pill above the headline, e.g. "Included with your VIP membership".',
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
          validation: (r) => r.required(),
          description: "Renders in the brand gradient, so put the punchline here.",
        }),
        defineField({
          name: "body",
          type: "text",
          rows: 4,
          validation: (r) => r.required(),
          description: "The pitch, written for this partner's audience specifically.",
        }),
        defineField({ name: "ctaLabel", title: "Button label", type: "string" }),
        defineField({
          name: "ctaNote",
          title: "Note under the button",
          type: "string",
          description: 'e.g. "Takes 30 seconds to book."',
        }),
        defineField({
          name: "image",
          title: "Partner image",
          type: "image",
          options: { hotspot: true },
          description:
            "The partner's founder or course art. Empty renders an on-brand placeholder frame.",
        }),
        defineField({
          name: "quote",
          title: "Quote over the image",
          type: "object",
          description: "The short pull-quote that sits on the image.",
          options: { collapsible: true, collapsed: false },
          fields: [
            defineField({ name: "text", type: "text", rows: 3 }),
            defineField({
              name: "attribution",
              type: "string",
              description: 'e.g. "Baotran Tran — UGC Foundations".',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: "valueStack",
      title: "Value stack",
      type: "object",
      group: "value",
      description:
        "The itemized receipt. Prices are display strings — type them exactly as they should read.",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "title", type: "string", validation: (r) => r.required() }),
        defineField({
          name: "items",
          title: "Line items",
          type: "array",
          validation: (r) => r.min(1),
          of: [
            {
              type: "object",
              fields: [
                defineField({ name: "label", type: "string", validation: (r) => r.required() }),
                defineField({
                  name: "sublabel",
                  type: "string",
                  description: "The one-liner under the item name.",
                }),
                defineField({
                  name: "price",
                  type: "string",
                  validation: (r) => r.required(),
                  description: 'e.g. "$500.00" — shown struck through.',
                }),
              ],
              preview: { select: { title: "label", subtitle: "price" } },
            },
          ],
        }),
        defineField({
          name: "subtotal",
          type: "string",
          description: 'The struck-through sum, e.g. "$947.00".',
        }),
        defineField({
          name: "totalLabel",
          type: "string",
          description: 'e.g. "Total due — VIP members".',
        }),
        defineField({
          name: "totalValue",
          type: "string",
          description: 'e.g. "$0.00".',
        }),
        defineField({
          name: "footnote",
          type: "string",
          description: "Mono line under the total.",
        }),
      ],
    }),
    defineField({
      name: "partnerQuotes",
      title: "Partner quotes",
      type: "object",
      group: "quotes",
      description:
        "What the partner says about DeCypher, in their own words. Separate from the site-wide review carousel below it, which pulls from the Testimonials collection.",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "title", type: "string" }),
        defineField({
          name: "quotes",
          type: "array",
          of: [
            {
              type: "object",
              fields: [
                defineField({ name: "quote", type: "text", rows: 3, validation: (r) => r.required() }),
                defineField({
                  name: "attribution",
                  type: "string",
                  description: "Leave empty to keep the previous quote's speaker.",
                }),
              ],
              preview: { select: { title: "quote", subtitle: "attribution" } },
            },
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: { title: "partnerName", subtitle: "slug.current" },
    prepare: ({ title, subtitle }) => ({
      title: title ?? "Untitled partner",
      subtitle: subtitle ? `/${subtitle}` : "no route set",
    }),
  },
});

export const PAGE_TYPES = [
  "homePage",
  "servicesPage",
  "creatorsPage",
  "teamPage",
  "schedulePage",
  "careersPage",
  "affiliatePage",
] as const;
