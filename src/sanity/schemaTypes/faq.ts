import { defineArrayMember, defineField, defineType } from "sanity";
import { pageLinkField } from "./pageLink";

/**
 * The Creator Tax FAQ: /faq (the hub), /faq/<slug> (one page per question),
 * and the handful of questions on Home and every affiliate page (Site
 * Settings → FAQ → Questions on Home).
 *
 *   faqPage      — singleton: the hub's copy, the CTAs, the disclaimers, the
 *                  "Where are you?" rows, the Master Class link
 *   faqCategory  — the hub's sections, in order
 *   faqQuestion  — one document per question, filed under a category
 *
 * The first 89 questions came from the FAQ doc Acquisition.com's team wrote
 * (scripts/import-faq.mjs). After that, this is where they're written.
 */

/** Word count for the short-answer warning. Plain text, so a split is enough. */
const words = (s: unknown) => String(s ?? "").split(/\s+/).filter(Boolean).length;

export const faqCategory = defineType({
  name: "faqCategory",
  title: "FAQ category",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
      description:
        'A section heading on /faq — e.g. "S-Corp & entity". Renaming one changes its jump link (/faq#s-corp-and-entity).',
    }),
    defineField({
      name: "order",
      type: "number",
      validation: (r) => r.required(),
      description: "Position on /faq; lower comes first.",
    }),
  ],
  orderings: [{ title: "Hub order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: {
    select: { title: "title", order: "order" },
    prepare: ({ title, order }) => ({ title, subtitle: order != null ? `#${order}` : undefined }),
  },
});

export const faqQuestion = defineType({
  name: "faqQuestion",
  title: "FAQ question",
  type: "document",
  fields: [
    pageLinkField({ basePath: "/faq" }),
    defineField({
      name: "question",
      type: "string",
      validation: (r) => r.required(),
      description:
        "Written the way a creator would type it into Google or ChatGPT. It's the page's heading and its title in search results.",
    }),
    defineField({
      name: "slug",
      title: "Route",
      type: "slug",
      options: { source: "question", maxLength: 80 },
      validation: (r) => r.required(),
      description:
        'URL under /faq/ — "ssn-or-ein-on-my-w9" serves /faq/ssn-or-ein-on-my-w9. Keep it short. Don\'t change it once the page is live: links and search results point at it.',
    }),
    defineField({
      name: "category",
      type: "reference",
      to: [{ type: "faqCategory" }],
      validation: (r) => r.required(),
      description: 'Which section of /faq it sits under. Pick one, or hit "Create new".',
    }),
    defineField({
      name: "order",
      type: "number",
      description: "Position within its category; lower comes first. Empty sorts after the numbered ones.",
    }),
    defineField({
      name: "shortAnswer",
      title: "Short answer",
      type: "text",
      rows: 3,
      validation: (r) => [
        r.required(),
        r.custom((v) => (words(v) > 60 ? `${words(v)} words — aim for under 50.` : true)).warning(),
      ],
      description:
        "One or two sentences that answer the question on their own. Shown in bold under the question, on /faq and on Home, and used as the search-result description. It's the line AI assistants quote, so make it complete.",
    }),
    defineField({
      name: "body",
      title: "Full answer",
      type: "array",
      description:
        "Everything after the short answer. H2/H3 for sub-sections, bullets, numbered steps, quotes and tables all work. An answer that states specific numbers can end with its own italic disclaimer line.",
      of: [
        defineArrayMember({
          type: "block",
          styles: [
            { title: "Normal", value: "normal" },
            { title: "H2", value: "h2" },
            { title: "H3", value: "h3" },
            { title: "H4", value: "h4" },
            { title: "Quote", value: "blockquote" },
          ],
          lists: [
            { title: "Bullet", value: "bullet" },
            { title: "Numbered", value: "number" },
          ],
          marks: {
            decorators: [
              { title: "Bold", value: "strong" },
              { title: "Italic", value: "em" },
            ],
            annotations: [
              {
                name: "link",
                type: "object",
                title: "Link",
                fields: [
                  defineField({
                    name: "href",
                    type: "url",
                    description: 'Site pages as a path ("/faq/ssn-or-ein-on-my-w9", "/schedule-team"); anything else as a full URL.',
                    validation: (r) =>
                      r.required().uri({ allowRelative: true, scheme: ["http", "https", "mailto"] }),
                  }),
                ],
              },
            ],
          },
        }),
        // @sanity/table: the first row renders as the header row.
        defineArrayMember({ type: "table", title: "Table (first row is the header)" }),
      ],
    }),
    defineField({
      name: "related",
      title: "Related questions",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "faqQuestion" }] })],
      validation: (r) => r.unique().max(6),
      description: "Linked under the answer. Three or four is plenty.",
    }),
    defineField({
      name: "nextStep",
      title: "Next step",
      type: "string",
      initialValue: "booking",
      options: {
        layout: "radio",
        list: [
          { title: "Book a free consultation", value: "booking" },
          { title: "Watch the Write Off Master Class", value: "masterClass" },
          { title: "Try the tax estimator", value: "estimator" },
        ],
      },
      description:
        "The button under the answer. The wording of each lives on FAQ Page → Calls to action. Master Class falls back to booking until its link is set there.",
    }),
  ],
  orderings: [
    {
      title: "Hub order",
      name: "orderAsc",
      by: [
        { field: "category.order", direction: "asc" },
        { field: "order", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: { title: "question", category: "category.title", slug: "slug.current" },
    prepare: ({ title, category, slug }) => ({
      title: title ?? "Untitled question",
      subtitle: [category, slug ? `/faq/${slug}` : "no route set"].filter(Boolean).join(" · "),
    }),
  },
});

const ctaFields = (defaults: { prompt: string; button: string }) => [
  defineField({
    name: "prompt",
    type: "string",
    initialValue: defaults.prompt,
    description: "The line above the button.",
  }),
  defineField({
    name: "button",
    type: "string",
    initialValue: defaults.button,
    description: "The button's label.",
  }),
];

const GROUPS = [
  { name: "copy", title: "Hub copy", default: true },
  { name: "where", title: "Where are you?" },
  { name: "cta", title: "Calls to action" },
  { name: "legal", title: "Disclaimers" },
  { name: "seo", title: "SEO" },
];

export const faqPage = defineType({
  name: "faqPage",
  title: "FAQ Page",
  type: "document",
  groups: GROUPS,
  fields: [
    defineField({
      name: "eyebrow",
      type: "string",
      group: "copy",
      description: 'Small mono label above the heading — e.g. "[ creator tax faq ]".',
    }),
    defineField({
      name: "title",
      type: "string",
      group: "copy",
      validation: (r) => r.required(),
      description: "The /faq heading.",
    }),
    defineField({
      name: "intro",
      type: "array",
      group: "copy",
      of: [defineArrayMember({ type: "text", rows: 2 })],
      description: "Paragraphs under the heading, one per item.",
    }),
    defineField({
      name: "author",
      type: "object",
      group: "copy",
      description:
        "Who answers, as shown in the byline on every FAQ page and named in the search-engine markup.",
      fields: [
        defineField({ name: "name", type: "string" }),
        defineField({ name: "jobTitle", title: "Job title", type: "string" }),
      ],
    }),
    defineField({
      name: "generalNote",
      title: "Note under the byline",
      type: "string",
      group: "copy",
    }),
    defineField({
      name: "whereAreYou",
      title: "Where are you?",
      type: "array",
      group: "where",
      description: "Situation-first way in at the top of /faq: a situation, and the question to read first.",
      of: [
        defineArrayMember({
          type: "object",
          name: "faqWhereRow",
          fields: [
            defineField({
              name: "situation",
              type: "string",
              validation: (r) => r.required(),
              description: 'In the creator\'s words — e.g. "I got a tax bill I wasn\'t ready for".',
            }),
            defineField({
              name: "question",
              type: "reference",
              to: [{ type: "faqQuestion" }],
              validation: (r) => r.required(),
            }),
          ],
          preview: {
            select: { title: "situation", subtitle: "question.question" },
          },
        }),
      ],
    }),
    defineField({
      name: "cta",
      title: "Calls to action",
      type: "object",
      group: "cta",
      description:
        "The box under every answer, by the question's Next step. Booking buttons go wherever Site Settings → Consultation button points.",
      fields: [
        defineField({
          name: "booking",
          title: "Book a free consultation",
          type: "object",
          fields: ctaFields({
            prompt: "Full-time creator? Book a free consultation and see what you could be saving.",
            button: "Book a free consultation",
          }),
        }),
        defineField({
          name: "masterClass",
          title: "Write Off Master Class",
          type: "object",
          fields: [
            defineField({
              name: "url",
              title: "Link",
              type: "url",
              validation: (r) => r.uri({ allowRelative: true, scheme: ["http", "https"] }),
              description:
                "The Master Class page or video. Until this is set, questions pointing here show the booking box instead.",
            }),
            ...ctaFields({
              prompt: "Want the full list of what creators can write off?",
              button: "Watch the free Write Off Master Class",
            }),
          ],
        }),
        defineField({
          name: "estimator",
          title: "Tax estimator",
          type: "object",
          description: "Links to /tax-estimator.",
          fields: ctaFields({
            prompt: "Want a number for your own year? The estimator takes 60 seconds, no login.",
            button: "Try the tax estimator",
          }),
        }),
      ],
    }),
    defineField({
      name: "disclaimer",
      type: "text",
      rows: 2,
      group: "legal",
      description: "Closes every FAQ page.",
    }),
    defineField({
      name: "footerLine",
      title: "Question page footer",
      type: "text",
      rows: 2,
      group: "legal",
      description: 'Above the disclaimer on each question page, followed by "See all questions or visit the homepage".',
    }),
    defineField({
      name: "seo",
      type: "seoBlock",
      group: "seo",
      description: "For /faq itself. Question pages use the question as the title and the short answer as the description.",
    }),
  ],
  preview: { prepare: () => ({ title: "FAQ Page", subtitle: "/faq" }) },
});
