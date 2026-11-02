import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { table } from "@sanity/table";
import { visionTool } from "@sanity/vision";
import { dataset, projectId } from "@/sanity/env";
import { schemaTypes } from "@/sanity/schemaTypes";
import { structure } from "@/sanity/structure";

/** Types that exist as exactly one document — hide them from "create new". */
const SINGLETONS = new Set([
  "homePage",
  "servicesPage",
  "creatorsPage",
  "teamPage",
  "schedulePage",
  "faqPage",
  "siteSettings",
]);

export default defineConfig({
  name: "decypher",
  title: "DeCypher Financials",
  basePath: "/studio",
  projectId,
  dataset,
  // table(): the `table` block type, for tables inside FAQ answers
  plugins: [structureTool({ structure }), visionTool(), table()],
  schema: {
    types: schemaTypes,
    templates: (templates) => [
      ...templates.filter((t) => !SINGLETONS.has(t.schemaType)),
      // "Questions by category" → new: the question arrives already filed
      {
        id: "faqQuestion-in-category",
        title: "FAQ question in this category",
        schemaType: "faqQuestion",
        parameters: [{ name: "categoryId", type: "string" }],
        value: ({ categoryId }: { categoryId: string }) => ({
          category: { _type: "reference", _ref: categoryId },
          nextStep: "booking",
        }),
      },
    ],
  },
  document: {
    // singletons can't be duplicated or deleted from the UI
    actions: (actions, { schemaType }) =>
      SINGLETONS.has(schemaType)
        ? actions.filter(
            (a) => !["duplicate", "delete", "unpublish"].includes(a.action ?? ""),
          )
        : actions,
  },
});
