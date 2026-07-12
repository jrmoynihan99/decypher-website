import { defineField, defineType } from "sanity";

/** Categories drive the accent color on badges — the palette lives in code (src/lib/creators.ts). */
const CREATOR_CATEGORIES = [
  "Lifestyle",
  "Beauty",
  "Gaming",
  "UGC",
  "Comedy",
  "Coaching",
  "Food",
  "Finance",
  "Fashion",
  "Music",
  "Sports",
  "Mixology",
  "Editor",
  "TikTok Shop",
  "Tech",
  "Management Company",
  "Podcast",
  "Storytelling",
  "Fitness",
  "Travel",
  "Trickshots",
];

/** Filter tabs on the Creators page group by this coarser bucket. */
const CREATOR_GROUPS = [
  "Lifestyle",
  "Beauty",
  "Coaching",
  "Comedy",
  "UGC",
  "Food",
  "Finance",
  "Gaming",
  "Fashion",
  "Music",
  "Other",
];

export const creator = defineType({
  name: "creator",
  title: "Creator",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "category",
      type: "string",
      options: { list: CREATOR_CATEGORIES },
      validation: (r) => r.required(),
      description: "Shown on the card badge; sets its accent color.",
    }),
    defineField({
      name: "group",
      type: "string",
      options: { list: CREATOR_GROUPS },
      validation: (r) => r.required(),
      description: "Which filter tab the creator appears under on Our Creators.",
    }),
    defineField({ name: "description", type: "text", rows: 2 }),
    defineField({
      name: "links",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "platform",
              type: "string",
              options: {
                list: [
                  { title: "Instagram", value: "instagram" },
                  { title: "YouTube", value: "youtube" },
                  { title: "TikTok", value: "tiktok" },
                  { title: "Website", value: "website" },
                ],
              },
              validation: (r) => r.required(),
            }),
            defineField({ name: "url", type: "url", validation: (r) => r.required() }),
          ],
          preview: { select: { title: "platform", subtitle: "url" } },
        },
      ],
    }),
    defineField({
      name: "image",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "order",
      type: "number",
      description:
        "Sort position. The first 16 creators appear in the home hero strip and roster.",
      validation: (r) => r.required(),
    }),
  ],
  orderings: [
    {
      title: "Site order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "name", subtitle: "category", media: "image" },
  },
});

export const testimonial = defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({ name: "quote", type: "text", rows: 4, validation: (r) => r.required() }),
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "handle",
      type: "string",
      description: "e.g. @mayamakesup",
    }),
    defineField({
      name: "followers",
      type: "string",
      description: 'e.g. "890K followers"',
    }),
    defineField({
      name: "category",
      type: "string",
      description: "Badge on the card, e.g. Beauty.",
    }),
    defineField({
      name: "accent",
      type: "string",
      options: {
        list: [
          { title: "Magenta", value: "magenta" },
          { title: "Violet", value: "violet" },
          { title: "Orange", value: "orange" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "magenta",
      description: "Badge color — keeps cards on the brand palette.",
    }),
    defineField({
      name: "row",
      title: "Marquee row",
      type: "string",
      options: {
        list: [
          { title: "Top row", value: "a" },
          { title: "Bottom row", value: "b" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "a",
      validation: (r) => r.required(),
      description: "The reviews reel scrolls two rows in opposite directions.",
    }),
    defineField({ name: "order", type: "number", validation: (r) => r.required() }),
  ],
  orderings: [
    {
      title: "Site order",
      name: "orderAsc",
      by: [
        { field: "row", direction: "asc" },
        { field: "order", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: { title: "name", subtitle: "quote" },
  },
});

export const teamMember = defineType({
  name: "teamMember",
  title: "Team member",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "tag",
      type: "string",
      description: 'Optional badge on the card, e.g. "Co-Founder".',
    }),
    defineField({ name: "role", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "tier",
      type: "string",
      options: {
        list: [
          { title: "Manager", value: "manager" },
          { title: "Senior", value: "senior" },
          { title: "Staff", value: "staff" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      validation: (r) => r.required(),
      description: "Managers get the wide feature cards; seniors and staff share the grid.",
    }),
    defineField({
      name: "codename",
      type: "string",
      description:
        'The thing they\'re deadliest at — decrypts on hover. Empty shows "Awaiting decryption".',
    }),
    defineField({
      name: "image",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
      validation: (r) => r.required(),
    }),
    defineField({ name: "order", type: "number", validation: (r) => r.required() }),
  ],
  orderings: [
    {
      title: "Site order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "name", subtitle: "role", media: "image" },
  },
});

export const jobOpening = defineType({
  name: "jobOpening",
  title: "Job opening",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "department",
      type: "string",
      validation: (r) => r.required(),
      description: "Chip on the card, e.g. Tax, Bookkeeping, Operations.",
    }),
    defineField({
      name: "location",
      type: "string",
      description: 'e.g. "Remote — US".',
    }),
    defineField({
      name: "type",
      title: "Employment type",
      type: "string",
      options: {
        list: ["Full-time", "Part-time", "Contract", "Internship"],
      },
      initialValue: "Full-time",
    }),
    defineField({
      name: "comp",
      title: "Compensation",
      type: "string",
      description: 'Optional, e.g. "$85k–$110k". Empty hides it.',
    }),
    defineField({
      name: "blurb",
      type: "text",
      rows: 4,
      validation: (r) => r.required(),
      description: "Two or three sentences on the card — the pitch for the role.",
    }),
    defineField({
      name: "tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      description: "Optional mono tags, e.g. QBO / 1120-S / STRATEGY.",
    }),
    defineField({
      name: "applyHref",
      title: "Apply link",
      type: "string",
      validation: (r) => r.required(),
      description:
        "Where the whole card links: a mailto: (mailto:careers@…?subject=Role) or a job-post URL.",
    }),
    defineField({ name: "order", type: "number", validation: (r) => r.required() }),
  ],
  orderings: [
    {
      title: "Site order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "department" },
  },
});

export const service = defineType({
  name: "service",
  title: "Service",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "promise",
      type: "string",
      validation: (r) => r.required(),
      description: 'The all-caps hook, e.g. "PAY LESS TO THE IRS".',
    }),
    defineField({ name: "body", type: "text", rows: 4, validation: (r) => r.required() }),
    defineField({
      name: "chips",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      description: 'Optional mono tags, e.g. LLC / EIN / BOI / BANK.',
    }),
    defineField({
      name: "nodeTag",
      type: "string",
      validation: (r) => r.required(),
      description: 'Mono node label on the neural map, e.g. "TAX_STRATEGY.NODE".',
    }),
    defineField({
      name: "image",
      type: "image",
      options: { hotspot: true },
      description:
        "Shown on the Services page chapters. Empty shows the on-brand awaiting-asset frame.",
    }),
    defineField({
      name: "imgLabel",
      title: "Image slot label",
      type: "string",
      description: "Mono filename shown on the placeholder frame while no image is set.",
    }),
    defineField({
      name: "order",
      type: "number",
      validation: (r) => r.required().min(1).max(9),
      description: "Position 1–5. Node colors on the neural map follow this order.",
    }),
  ],
  orderings: [
    {
      title: "Site order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "promise", media: "image", order: "order" },
    prepare: ({ title, subtitle, media, order }) => ({
      title: `${String(order ?? 0).padStart(2, "0")} — ${title}`,
      subtitle,
      media,
    }),
  },
});
