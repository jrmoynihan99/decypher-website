import type { StructureResolver } from "sanity/structure";

/**
 * Studio sidebar:
 *
 *   Pages          → the six page documents (fixed IDs — one doc per template)
 *   Creators       → roster collection, in site order
 *   Testimonials   → reviews reel, grouped by marquee row
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
  "creator",
  "testimonial",
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
