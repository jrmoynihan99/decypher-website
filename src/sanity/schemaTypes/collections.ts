import { defineField, defineType } from "sanity";

/**
 * Tiny taxonomy documents behind the Creator category/group pickers.
 * Reference fields give editors the existing options AND a "Create new"
 * button right in the field — the old hardcoded dropdowns couldn't grow.
 * Deliberately absent from the Studio sidebar (see structure.ts); existing
 * string values were converted by scripts/migrate-creator-taxonomies.mjs.
 */
export const creatorCategory = defineType({
  name: "creatorCategory",
  title: "Creator category",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
  ],
  preview: { select: { title: "title" } },
});

export const creatorGroup = defineType({
  name: "creatorGroup",
  title: "Creator group (filter tab)",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
  ],
  preview: { select: { title: "title" } },
});

export const creator = defineType({
  name: "creator",
  title: "Creator",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "category",
      type: "reference",
      to: [{ type: "creatorCategory" }],
      validation: (r) => r.required(),
      description:
        'Shown on the card badge; sets its accent color (known names use their brand color, new ones are auto-assigned a color from the palette). Pick from the list or hit "Create new" right here.',
    }),
    defineField({
      name: "group",
      type: "reference",
      to: [{ type: "creatorGroup" }],
      validation: (r) => r.required(),
      description:
        'Which filter tab the creator appears under on Our Creators. Pick from the list or "Create new".',
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
    select: { title: "name", subtitle: "category.title", media: "image" },
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
      name: "image",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
      description:
        "Avatar on the review card. Empty falls back to the person's initials.",
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
    // `row` is retained, hidden, only so the value still on existing documents
    // doesn't trip Studio's unknown-field warning. The reel now deals its two
    // rows alternately down `order` (see getTestimonials) — picking a row by
    // hand is what let the top row grow to 60 cards against the bottom's 3.
    defineField({ name: "row", type: "string", hidden: true }),
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
    select: { title: "name", subtitle: "quote", media: "image" },
  },
});

export const videoTestimonial = defineType({
  name: "videoTestimonial",
  title: "Video testimonial",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Creator name",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "handle",
      type: "string",
      description: "e.g. @mayamakesup — shown next to the name under the video.",
    }),
    defineField({
      name: "videoUrl",
      title: "Video URL",
      type: "url",
      validation: (r) => r.required(),
      description:
        "YouTube link in any form (watch, share, or embed URL). Other embeddable players work too.",
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
    select: { title: "name", subtitle: "videoUrl" },
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
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (r) => r.required(),
      description:
        "URL of the role's detail page: /careers/<slug>. Hit Generate after typing the title.",
    }),
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
      name: "videoUrl",
      title: "Video (VSL) URL",
      type: "url",
      description:
        "Optional video at the top of the role's detail page — YouTube link in any form (watch, share, or embed). Empty hides the player.",
    }),
    defineField({
      name: "description",
      title: "Full description",
      type: "array",
      description:
        "The complete posting on the role's detail page — responsibilities, requirements, benefits. Empty falls back to the card blurb.",
      of: [
        {
          type: "block",
          styles: [
            { title: "Normal", value: "normal" },
            { title: "H1", value: "h1" },
            { title: "H2", value: "h2" },
            { title: "H3", value: "h3" },
            { title: "H4", value: "h4" },
            { title: "H5 (mono label)", value: "h5" },
            { title: "H6 (mono label)", value: "h6" },
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
              { title: "Underline", value: "underline" },
              { title: "Code", value: "code" },
            ],
            annotations: [
              {
                name: "link",
                type: "object",
                title: "Link",
                fields: [
                  defineField({
                    name: "href",
                    title: "URL",
                    type: "url",
                    validation: (r) =>
                      r.uri({
                        allowRelative: true,
                        scheme: ["http", "https", "mailto", "tel"],
                      }),
                  }),
                ],
              },
            ],
          },
        },
      ],
    }),
    defineField({
      name: "tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      description: "Optional mono tags, e.g. QBO / 1120-S / STRATEGY.",
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
