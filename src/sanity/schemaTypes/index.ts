import type { SchemaTypeDefinition } from "sanity";
import {
  creator,
  creatorCategory,
  creatorGroup,
  jobOpening,
  service,
  teamMember,
  testimonial,
  videoTestimonial,
} from "./collections";
import { legalPage } from "./legal";
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
  affiliatePage,
  careersPage,
  creatorsPage,
  homePage,
  schedulePage,
  servicesPage,
  teamPage,
} from "./pages";
import { leaderboardPage } from "./leaderboard";
import { siteSettings } from "./siteSettings";
import { thankYouPage } from "./thankYou";

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
  careersPage,
  affiliatePage,
  thankYouPage,
  legalPage,
  leaderboardPage,
  // collections
  creator,
  creatorCategory,
  creatorGroup,
  testimonial,
  videoTestimonial,
  teamMember,
  service,
  jobOpening,
  // singletons
  siteSettings,
];
