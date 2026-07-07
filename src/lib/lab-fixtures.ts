import { NODE_TAGS } from "@/components/home/services-variants/NeuralStage";
import { SERVICES_FIVE } from "@/lib/content";
import type { CmsService, SectionHeadingContent } from "@/sanity/types";

/**
 * Static props for the /services-lab playground. The production site feeds
 * the neural-web variants from Sanity; the lab keeps its own frozen copy so
 * variant comparisons don't depend on CMS state.
 */

export const LAB_SERVICES_HEADING: SectionHeadingContent = {
  eyebrow: "[ 05 // services ]",
  title: "One stop shop for your creator business.",
};

export const LAB_SERVICES: CmsService[] = SERVICES_FIVE.map((s, i) => ({
  order: i + 1,
  num: s.num,
  title: s.title,
  promise: s.promise,
  body: s.body,
  chips: s.chips,
  nodeTag: NODE_TAGS[i],
  imgLabel: s.imgLabel,
  img: s.img,
}));
