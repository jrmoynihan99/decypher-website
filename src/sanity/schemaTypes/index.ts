import type { SchemaTypeDefinition } from "sanity";
import { creator, service, teamMember, testimonial } from "./collections";
import {
  ctaBlock,
  faqItem,
  navLink,
  pageHeaderBlock,
  sectionHeadingBlock,
  seoBlock,
  statItem,
} from "./objects";
import {
  creatorsPage,
  homePage,
  schedulePage,
  servicesPage,
  teamPage,
} from "./pages";
import { siteSettings } from "./siteSettings";

export const schemaTypes: SchemaTypeDefinition[] = [
  // objects
  sectionHeadingBlock,
  pageHeaderBlock,
  ctaBlock,
  navLink,
  seoBlock,
  faqItem,
  statItem,
  // pages
  homePage,
  servicesPage,
  creatorsPage,
  teamPage,
  schedulePage,
  // collections
  creator,
  testimonial,
  teamMember,
  service,
  // singletons
  siteSettings,
];
