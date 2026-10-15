import { defineField, defineType } from "sanity";

/**
 * Portal resources: the PDFs the staff Tools Hub hands out (hotline lists,
 * guides, checklists), filed under categories the team invents as it goes.
 *
 * Both are plain documents in the Studio sidebar (Portal Resources →
 * Resources / Categories). A category can also be made inline from the
 * resource's category field ("Create new"), like creator categories.
 *
 * Mind the trust boundary before adding one: the dataset is public-read (see
 * docs/PORTAL.md), so a PDF here is reachable by anyone holding the project
 * id and its asset URL. Nothing with a client's data, a password or a key.
 */

export const resourceCategory = defineType({
  name: "resourceCategory",
  title: "Resource category",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
      description: "The section heading in the Tools Hub — e.g. Phone numbers, Checklists, Guides.",
    }),
    defineField({
      name: "description",
      type: "text",
      rows: 2,
      description: "One line under the heading. Optional.",
    }),
    defineField({
      name: "order",
      type: "number",
      validation: (r) => r.required(),
      description: "Sort position in the Tools Hub; lower comes first.",
    }),
  ],
  orderings: [{ title: "Hub order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "title", subtitle: "description" } },
});

export const resource = defineType({
  name: "resource",
  title: "Resource (PDF)",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
      description: "What the card is called — say what it is, not the file name.",
    }),
    defineField({
      name: "file",
      title: "PDF",
      type: "file",
      options: { accept: "application/pdf,.pdf" },
      validation: (r) => r.required(),
      description:
        "The document itself. Uploading a new file here replaces the old one for the whole team at once. Not for anything with a client's data, a password or a key — this dataset is readable outside the portal.",
    }),
    defineField({
      name: "category",
      type: "reference",
      to: [{ type: "resourceCategory" }],
      validation: (r) => r.required(),
      description: 'Which section it sits under in the Tools Hub. Pick from the list or hit "Create new" right here.',
    }),
    defineField({
      name: "description",
      type: "text",
      rows: 2,
      description: "What's in it and when to reach for it. Shown on the card.",
    }),
    defineField({
      name: "order",
      type: "number",
      description: "Sort position within its category; lower comes first. Leave empty to sort by title after the numbered ones.",
    }),
  ],
  orderings: [{ title: "Category order", name: "orderAsc", by: [{ field: "order", direction: "asc" }, { field: "title", direction: "asc" }] }],
  preview: {
    select: { title: "title", category: "category.title", filename: "file.asset.originalFilename" },
    prepare: ({ title, category, filename }) => ({
      title: title ?? "Untitled resource",
      subtitle: [category, filename].filter(Boolean).join(" · ") || "no file yet",
    }),
  },
});
