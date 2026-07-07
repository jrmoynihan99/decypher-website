import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
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
  "siteSettings",
]);

export default defineConfig({
  name: "decypher",
  title: "DeCypher Financials",
  basePath: "/studio",
  projectId,
  dataset,
  plugins: [structureTool({ structure }), visionTool()],
  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter((t) => !SINGLETONS.has(t.schemaType)),
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
