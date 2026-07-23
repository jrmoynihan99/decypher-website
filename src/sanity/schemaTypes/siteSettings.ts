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
    { name: "faq", title: "FAQ" },
    { name: "email", title: "Email" },
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
    defineField({
      name: "leadEmail",
      title: "Estimate email sender",
      type: "object",
      group: "email",
      description:
        "Envelope for the estimator's emailed estimate. Addresses must be on the Resend-verified domain (wedecypher.co) or sends will fail. Empty falls back to the server's environment config.",
      fields: [
        defineField({
          name: "fromName",
          title: "From name",
          type: "string",
          description: "The display name in the recipient's inbox.",
          initialValue: "DeCypher Financials",
        }),
        defineField({
          name: "fromAddress",
          title: "From address",
          type: "string",
          description:
            "e.g. otavio@wedecypher.co — the mailbox does not have to exist to send, but replies bounce if it can't receive.",
          validation: (r) =>
            r.regex(/^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/, {
              name: "email address",
              invert: false,
            }),
        }),
        defineField({
          name: "replyTo",
          title: "Reply-to address",
          type: "string",
          description:
            "Where replies actually land — a real, monitored inbox. Empty means replies go to the From address.",
          validation: (r) =>
            r.regex(/^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/, {
              name: "email address",
              invert: false,
            }),
        }),
      ],
    }),
    defineField({
      name: "faqs",
      title: "Questions",
      type: "array",
      group: "faq",
      of: [{ type: "faqItem" }],
      description:
        "Asked and answered once, shown on Home and on every affiliate page. Editing one here updates all of them.",
    }),
  ],
  preview: { prepare: () => ({ title: "Site Settings" }) },
});
