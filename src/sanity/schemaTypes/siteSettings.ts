import { defineField, defineType } from "sanity";

/** Global, site-wide content: nav, footer, stats, default SEO, the consult CTA. */
export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  groups: [
    { name: "brand", title: "Brand & SEO" },
    { name: "nav", title: "Navbar" },
    { name: "footer", title: "Footer" },
    { name: "stats", title: "Stats" },
  ],
  fields: [
    defineField({
      name: "logo",
      type: "image",
      group: "brand",
      description: "Navbar + footer logo. Empty falls back to the bundled mark.",
    }),
    defineField({
      name: "defaultSeo",
      title: "Default SEO",
      type: "seoBlock",
      group: "brand",
      description: "Used when a page has no SEO overrides of its own.",
    }),
    defineField({
      name: "consultCta",
      title: "Consultation button",
      type: "object",
      group: "brand",
      description: "The gradient CTA used across the site.",
      fields: [
        defineField({ name: "label", type: "string", initialValue: "Free Consultation" }),
        defineField({
          name: "href",
          title: "Link",
          type: "string",
          initialValue: "/schedule",
          description: "Where the button goes — normally the Book a Call page route.",
        }),
      ],
    }),
    defineField({
      name: "navLinks",
      title: "Navbar links",
      type: "array",
      group: "nav",
      of: [{ type: "navLink" }],
    }),
    defineField({
      name: "footer",
      type: "object",
      group: "footer",
      fields: [
        defineField({ name: "tagline", type: "string" }),
        defineField({
          name: "exploreLinks",
          title: "Explore column",
          type: "array",
          of: [{ type: "navLink" }],
        }),
        defineField({ name: "phone", type: "string", description: "Display format, e.g. (978) 409-4901" }),
        defineField({ name: "address", type: "string" }),
        defineField({
          name: "socialLinks",
          title: "Follow us column",
          type: "array",
          of: [{ type: "navLink" }],
        }),
        defineField({
          name: "legalLinks",
          title: "Legal column",
          type: "array",
          of: [{ type: "navLink" }],
        }),
        defineField({ name: "copyright", type: "string" }),
      ],
    }),
    defineField({
      name: "stats",
      title: "Stats",
      type: "array",
      group: "stats",
      of: [{ type: "statItem" }],
      description: "The proof numbers shown on Home and Book a Call.",
    }),
    defineField({
      name: "statsDisclaimer",
      type: "string",
      group: "stats",
      description: "Mono line under the stat cards. Leave empty to hide.",
    }),
  ],
  preview: { prepare: () => ({ title: "Site Settings" }) },
});
