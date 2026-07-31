import type { StructureResolver } from "sanity/structure";

/**
 * Studio sidebar:
 *
 *   Pages          → the six page documents (fixed IDs — one doc per template)
 *   Affiliate Pages→ partner landing pages — a LIST, not fixed docs: the client
 *                    adds one per affiliate from here
 *   Thank You Pages→ post-booking pages — also a LIST: one per ad campaign, so
 *                    each conversion has its own URL to fire a pixel on
 *   Creators       → roster collection, in site order
 *   Testimonials   → reviews reel, grouped by marquee row
 *   Video Testimonials → thank-you video wall, in site order
 *   Team           → personnel files, in site order
 *   Services       → the five service nodes
 *   Job Openings   → careers-page roles, in site order
 *   Site Settings  → nav, footer, stats, default SEO
 */

const PAGES: Array<{ type: string; title: string }> = [
  { type: "homePage", title: "Home" },
  { type: "servicesPage", title: "Services" },
  { type: "creatorsPage", title: "Our Creators" },
  { type: "teamPage", title: "Our Team" },
  { type: "schedulePage", title: "Book a Call" },
  { type: "careersPage", title: "Careers" },
];

const HANDLED = [
  ...PAGES.map((p) => p.type),
  "affiliatePage",
  "thankYouPage",
  "legalPage",
  "creator",
  // taxonomy docs picked (and created inline) via reference fields on
  // Creator — deliberately kept out of the sidebar
  "creatorCategory",
  "creatorGroup",
  "testimonial",
  "videoTestimonial",
  "teamMember",
  "service",
  "jobOpening",
  "siteSettings",
  "media.tag",
];

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Pages")
        .child(
          S.list()
            .title("Pages")
            .items(
              PAGES.map((p) =>
                S.listItem()
                  .title(p.title)
                  .child(S.document().schemaType(p.type).documentId(p.type)),
              ),
            ),
        ),
      // A document list, not fixed children: affiliate pages are the one page
      // type the client creates more of.
      S.listItem()
        .title("Affiliate Pages")
        .child(
          S.documentTypeList("affiliatePage")
            .title("Affiliate Pages")
            .defaultOrdering([{ field: "partnerName", direction: "asc" }]),
        ),
      // One per ad campaign. Newest first: these accumulate as campaigns come
      // and go, and the one being set up right now is the one being looked for.
      S.listItem()
        .title("Thank You Pages")
        .child(
          S.documentTypeList("thankYouPage")
            .title("Thank You Pages")
            .defaultOrdering([{ field: "_createdAt", direction: "desc" }]),
        ),
      // Also a list — privacy policy, terms of use, anything else of that shape.
      // These URLs are registered with Intuit, so renaming a slug breaks a link
      // someone external is relying on.
      S.listItem()
        .title("Legal Pages")
        .child(
          S.documentTypeList("legalPage")
            .title("Legal Pages")
            .defaultOrdering([{ field: "title", direction: "asc" }]),
        ),
      S.divider(),
      S.listItem()
        .title("Creators")
        .child(
          S.documentTypeList("creator")
            .title("Creators")
            .defaultOrdering([{ field: "order", direction: "asc" }]),
        ),
      S.listItem()
        .title("Testimonials")
        .child(
          S.documentTypeList("testimonial")
            .title("Testimonials")
            .defaultOrdering([
              { field: "row", direction: "asc" },
              { field: "order", direction: "asc" },
            ]),
        ),
      S.listItem()
        .title("Video Testimonials")
        .child(
          S.documentTypeList("videoTestimonial")
            .title("Video Testimonials")
            .defaultOrdering([{ field: "order", direction: "asc" }]),
        ),
      S.listItem()
        .title("Team")
        .child(
          S.documentTypeList("teamMember")
            .title("Team")
            .defaultOrdering([{ field: "order", direction: "asc" }]),
        ),
      S.listItem()
        .title("Services")
        .child(
          S.documentTypeList("service")
            .title("Services")
            .defaultOrdering([{ field: "order", direction: "asc" }]),
        ),
      S.listItem()
        .title("Job Openings")
        .child(
          S.documentTypeList("jobOpening")
            .title("Job Openings")
            .defaultOrdering([{ field: "order", direction: "asc" }]),
        ),
      S.divider(),
      S.listItem()
        .title("Site Settings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings")),
      // anything not explicitly placed above still shows up
      ...S.documentTypeListItems().filter(
        (item) => !HANDLED.includes(item.getId() ?? ""),
      ),
    ]);
