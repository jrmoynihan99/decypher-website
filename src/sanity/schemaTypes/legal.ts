import { defineField, defineType } from "sanity";
import { pageLinkField } from "./pageLink";

/**
 * The drafted copy ships with [BRACKETED] blanks — entity name, address,
 * retention period and so on. The failure mode for a legal page is publishing
 * with "[MAILING ADDRESS]" still in the body and nobody noticing for a year, so
 * any that remain are surfaced in Studio by name.
 *
 * A warning rather than an error on purpose: a half-filled document still needs
 * to be savable, and blocking publish would only teach someone to work around it.
 */
type BodyBlock = { children?: { text?: string }[] };

function remainingPlaceholders(blocks: unknown): string[] {
  const found = new Set<string>();
  for (const block of Array.isArray(blocks) ? (blocks as BodyBlock[]) : []) {
    for (const child of block?.children ?? []) {
      // [ALL CAPS] only — an ordinary "[see section 3]" aside shouldn't trip it
      for (const m of String(child?.text ?? "").matchAll(/\[[A-Z][A-Z ,./-]*\]/g)) {
        found.add(m[0]);
      }
    }
  }
  return [...found];
}

/**
 * Legal documents — privacy policy, terms of use, and anything else of that
 * shape. A LIST rather than fixed documents, so a new one can be added without
 * a deploy.
 *
 * The whole body is editable here. That is a deliberate trade: it means legal
 * copy can be corrected in minutes, and it also means a change leaves no commit
 * trail and passes through no review. If that matters for a given document,
 * take the copy to counsel before publishing rather than relying on the CMS to
 * stop anyone.
 *
 * The slug is the URL segment beneath /legal/ — "privacy" serves /legal/privacy.
 * These URLs are registered with Intuit's app assessment, so changing a slug on
 * a published document breaks a link someone else is relying on.
 */
export const legalPage = defineType({
  name: "legalPage",
  title: "Legal Page",
  type: "document",
  fields: [
    pageLinkField({ basePath: "/legal" }),
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
      description: 'Heading at the top of the page — e.g. "Portal Privacy Policy".',
    }),
    defineField({
      name: "slug",
      title: "Route",
      type: "slug",
      options: { source: "title", maxLength: 64 },
      validation: (r) => r.required(),
      description:
        'URL segment under /legal/ — "privacy" serves /legal/privacy. Don\'t change it once the URL has been given out.',
    }),
    defineField({
      name: "eyebrow",
      type: "string",
      description:
        'Small label above the date — e.g. "End-user licence agreement". Optional.',
    }),
    defineField({
      name: "effectiveDate",
      title: "Effective date",
      type: "string",
      description:
        'Shown as written, so any format works — e.g. "28 July 2026". The date it takes effect, not the date it was drafted.',
    }),
    defineField({
      name: "body",
      title: "Document",
      type: "array",
      validation: (r) => [
        r.required(),
        r.custom((blocks) => {
          const left = remainingPlaceholders(blocks);
          return left.length
            ? `Still to fill in: ${left.join(", ")}`
            : true;
        }).warning(),
      ],
      description:
        "The full text of the page. Use H2 for section headings. Anything in [SQUARE BRACKETS] is a blank waiting on a real value.",
      of: [
        {
          type: "block",
          styles: [
            { title: "Normal", value: "normal" },
            { title: "H2 (section heading)", value: "h2" },
            { title: "H3", value: "h3" },
            { title: "H5 (mono label)", value: "h5" },
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
                    validation: (r) =>
                      r.required().uri({ allowRelative: true, scheme: ["http", "https", "mailto"] }),
                  }),
                ],
              },
            ],
          },
        },
      ],
    }),
    defineField({ name: "seo", type: "seoBlock" }),
  ],
  preview: {
    select: { title: "title", subtitle: "slug.current" },
    prepare: ({ title, subtitle }) => ({
      title,
      subtitle: subtitle ? `/legal/${subtitle}` : "no route set",
    }),
  },
});
