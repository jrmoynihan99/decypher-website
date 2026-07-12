import { defineField, defineType } from "sanity";

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

export const homePage = defineType({
  name: "homePage",
  title: "Home",
  type: "document",
  groups: [
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
  ],
  fields: [
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
          title: "YouTube embed URL",
          type: "url",
          description:
            "e.g. https://www.youtube.com/embed/XXXX — leave empty to show the placeholder frame.",
        }),
      ],
    }),
    defineField({
      name: "rosterSection",
      title: "Roster heading",
      type: "sectionHeadingBlock",
      group: "roster",
      description:
        "Cards come from the Creators collection (first 16 by order). {count} in the subline = total creators.",
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
      type: "object",
      group: "faq",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "title", type: "string" }),
        defineField({ name: "sub", title: "Subline", type: "text", rows: 2 }),
        defineField({
          name: "items",
          title: "Questions",
          type: "array",
          of: [{ type: "faqItem" }],
        }),
      ],
    }),
    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Home" }) },
});

export const servicesPage = defineType({
  name: "servicesPage",
  title: "Services",
  type: "document",
  groups: [
    { name: "header", title: "Header" },
    { name: "cta", title: "CTA" },
    { name: "meta", title: "Route & SEO" },
  ],
  fields: [
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

export const creatorsPage = defineType({
  name: "creatorsPage",
  title: "Our Creators",
  type: "document",
  groups: [
    { name: "header", title: "Header" },
    { name: "cta", title: "CTA" },
    { name: "meta", title: "Route & SEO" },
  ],
  fields: [
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

export const teamPage = defineType({
  name: "teamPage",
  title: "Our Team",
  type: "document",
  groups: [
    { name: "header", title: "Header" },
    { name: "tiers", title: "Tiers" },
    { name: "cta", title: "CTA" },
    { name: "meta", title: "Route & SEO" },
  ],
  fields: [
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

export const schedulePage = defineType({
  name: "schedulePage",
  title: "Book a Call",
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "confirmation", title: "Thank You" },
    { name: "proof", title: "Stats & Reviews" },
    { name: "meta", title: "Route & SEO" },
  ],
  fields: [
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
        defineField({
          name: "steps",
          title: "Call steps",
          type: "array",
          description: "What happens on the call — the numbered list next to the form.",
          of: [
            {
              type: "object",
              fields: [
                defineField({ name: "title", type: "string" }),
                defineField({ name: "body", type: "text", rows: 2 }),
              ],
              preview: { select: { title: "title", subtitle: "body" } },
            },
          ],
        }),
        defineField({
          name: "readout",
          type: "string",
          description: "Mono line under the steps.",
        }),
      ],
    }),
    defineField({
      name: "confirmation",
      type: "object",
      group: "confirmation",
      description:
        "The thank-you takeover shown after the form is submitted. The transmission-log panel (name, email, ref code) stays in code.",
      fields: [
        defineField({
          name: "eyebrow",
          type: "string",
          description: 'Teal status line, e.g. "● CHANNEL OPEN".',
        }),
        defineField({ name: "title", type: "string" }),
        defineField({ name: "body", type: "text", rows: 3 }),
        defineField({
          name: "nextSteps",
          title: "What happens next",
          type: "array",
          description: "The numbered cards under the confirmation.",
          of: [
            {
              type: "object",
              fields: [
                defineField({ name: "title", type: "string" }),
                defineField({ name: "body", type: "text", rows: 2 }),
              ],
              preview: { select: { title: "title", subtitle: "body" } },
            },
          ],
        }),
        defineField({
          name: "readout",
          type: "string",
          description: "Mono line at the bottom of the confirmation.",
        }),
      ],
    }),
    defineField({
      name: "statsSection",
      title: "Stats heading",
      type: "sectionHeadingBlock",
      group: "proof",
      description: "Stat values live in Site Settings → Stats.",
    }),
    defineField({
      name: "testimonialsSection",
      title: "Testimonials heading",
      type: "sectionHeadingBlock",
      group: "proof",
    }),
  ],
  preview: { prepare: () => ({ title: "Book a Call" }) },
});

export const careersPage = defineType({
  name: "careersPage",
  title: "Careers",
  type: "document",
  groups: [
    { name: "header", title: "Header" },
    { name: "openings", title: "Openings" },
    { name: "why", title: "Why DeCypher" },
    { name: "cta", title: "CTA" },
    { name: "meta", title: "Route & SEO" },
  ],
  fields: [
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

export const PAGE_TYPES = [
  "homePage",
  "servicesPage",
  "creatorsPage",
  "teamPage",
  "schedulePage",
  "careersPage",
] as const;
