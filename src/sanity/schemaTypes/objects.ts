import { defineField, defineType } from "sanity";

/**
 * Shared building blocks. Conventions carried through every schema:
 *
 * - "eyebrow"  → the mono bracket label above a heading, e.g. "[ 01 // proof of work ]"
 * - "readout"  → a mono status line, e.g. "// DATABASE ONLINE — 111 RECORDS".
 *   Readouts support two lightweight tokens, resolved at render time:
 *   `{count}` / `{tiers}` fill in live record counts, and `**word**`
 *   renders that word in brand magenta.
 */

/** Eyebrow + decrypting title + optional subline — the standard section header. */
export const sectionHeadingBlock = defineType({
  name: "sectionHeadingBlock",
  title: "Section heading",
  type: "object",
  fields: [
    defineField({ name: "eyebrow", type: "string", validation: (r) => r.required() }),
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "sub",
      title: "Subline",
      type: "text",
      rows: 2,
      description: "Optional copy under the title. Lines starting with // render in mono.",
    }),
  ],
  options: { collapsible: true, collapsed: false },
});

/** Sub-page hero (PageHeader component): eyebrow, H1, sub, mono readout. */
export const pageHeaderBlock = defineType({
  name: "pageHeaderBlock",
  title: "Page header",
  type: "object",
  fields: [
    defineField({ name: "eyebrow", type: "string", validation: (r) => r.required() }),
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sub", title: "Subline", type: "text", rows: 3 }),
    defineField({
      name: "readout",
      type: "string",
      description:
        "Mono status line. Tokens: {count} = live record count, **word** = magenta.",
    }),
  ],
  options: { collapsible: true, collapsed: false },
});

/** Closing CTA block: decrypting title, body, button, mono readout. */
export const ctaBlock = defineType({
  name: "ctaBlock",
  title: "CTA",
  type: "object",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "body", type: "text", rows: 3 }),
    defineField({
      name: "ctaLabel",
      title: "Button label",
      type: "string",
      description: "Label on the main consultation button.",
    }),
    defineField({
      name: "ctaHref",
      title: "Button link",
      type: "string",
      description:
        "Optional. Overrides where the main button points (e.g. mailto:careers@…). Empty uses the global consultation link.",
    }),
    defineField({
      name: "secondaryCtaLabel",
      title: "Secondary button label",
      type: "string",
      description: "Optional outlined second button.",
    }),
    defineField({
      name: "secondaryCtaHref",
      title: "Secondary button link",
      type: "string",
      description: "e.g. /services",
    }),
    defineField({
      name: "readout",
      type: "string",
      description: "Mono line under the buttons, e.g. // WEEKLY MODEL — CANCEL ANYTIME.",
    }),
  ],
  options: { collapsible: true, collapsed: false },
});

/** A labelled link. Internal paths ("/services"), anchors ("#faq"), or full URLs. */
export const navLink = defineType({
  name: "navLink",
  title: "Link",
  type: "object",
  fields: [
    defineField({ name: "label", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "href",
      title: "Link",
      type: "string",
      validation: (r) => r.required(),
      description: "Internal path (/services), anchor (#faq), or full URL.",
    }),
  ],
  preview: {
    select: { title: "label", subtitle: "href" },
  },
});

/** Per-page SEO overrides. */
export const seoBlock = defineType({
  name: "seoBlock",
  title: "SEO",
  type: "object",
  fields: [
    defineField({
      name: "title",
      title: "Meta title",
      type: "string",
      description: "Browser tab / search result title.",
    }),
    defineField({
      name: "description",
      title: "Meta description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "ogImage",
      title: "Share image",
      type: "image",
      description:
        "Shown when the page is shared to iMessage, Slack, LinkedIn, X, etc. Use 1200×630 — anything else gets cropped to that. Empty falls back to Site Settings, then to a generated DeCypher card.",
    }),
  ],
  options: { collapsible: true, collapsed: true },
});

/** Q&A pair for the FAQ accordion. */
export const faqItem = defineType({
  name: "faqItem",
  title: "FAQ item",
  type: "object",
  fields: [
    defineField({ name: "question", type: "string", validation: (r) => r.required() }),
    defineField({ name: "answer", type: "text", rows: 4, validation: (r) => r.required() }),
  ],
  preview: {
    select: { title: "question" },
  },
});

/** One stat card: display value + label. */
export const statItem = defineType({
  name: "statItem",
  title: "Stat",
  type: "object",
  fields: [
    defineField({
      name: "value",
      type: "string",
      validation: (r) => r.required(),
      description: 'Display value, e.g. "$4.6M+" — the number animates up on scroll.',
    }),
    defineField({ name: "label", type: "string", validation: (r) => r.required() }),
  ],
  preview: {
    select: { title: "value", subtitle: "label" },
  },
});
