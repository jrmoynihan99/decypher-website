/** Shapes returned by the fetch layer in src/sanity/queries.ts. */

export interface SeoContent {
  title?: string;
  description?: string;
}

export interface SectionHeadingContent {
  eyebrow?: string;
  title?: string;
  sub?: string;
}

export interface PageHeaderContent {
  eyebrow?: string;
  title?: string;
  sub?: string;
  /** Mono status line. Tokens: {count}, {tiers}, **word** → magenta. */
  readout?: string;
}

export interface CtaContent {
  title?: string;
  body?: string;
  ctaLabel?: string;
  /** Optional main-button destination; empty falls back to the consult link. */
  ctaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  readout?: string;
}

export interface LinkItem {
  label: string;
  href: string;
}

export interface StatContent {
  value: string;
  label: string;
}

export interface FaqContent {
  question: string;
  answer: string;
}

export interface CmsService {
  /** 1-based position; hub colors on the neural map follow it. */
  order: number;
  /** Zero-padded display number derived from order, e.g. "01". */
  num: string;
  title: string;
  promise: string;
  body: string;
  chips?: string[];
  nodeTag: string;
  imgLabel?: string;
  /** CDN image URL, when a service image has been set. */
  img?: string;
}

export type TestimonialAccent = "magenta" | "violet" | "orange";

/** Display-ready testimonial (accent preset resolved to colors, initials derived). */
export interface CmsTestimonial {
  quote: string;
  name: string;
  handle: string;
  followers: string;
  cat: string;
  initials: string;
  accent: string;
  accentBorder: string;
}

export interface CmsTeamMember {
  name: string;
  tag: string;
  role: string;
  tier: "manager" | "senior" | "staff";
  codename: string | null;
  img: string;
}

export interface SiteSettings {
  logo?: { url: string; width: number; height: number };
  defaultSeo?: SeoContent;
  consultCta?: { label?: string; href?: string };
  navLinks?: LinkItem[];
  footer?: {
    tagline?: string;
    exploreLinks?: LinkItem[];
    phone?: string;
    address?: string;
    socialLinks?: LinkItem[];
    legalLinks?: LinkItem[];
    copyright?: string;
  };
  stats?: StatContent[];
  statsDisclaimer?: string;
}

interface PageBase {
  slug: string;
  seo?: SeoContent;
}

export interface HomePageDoc extends PageBase {
  _type: "homePage";
  hero?: {
    eyebrow?: string;
    headlineLine1?: string;
    headlineLine2?: string;
    body?: string;
    ctaLabel?: string;
    secondaryCtaLabel?: string;
    scrollHint?: string;
  };
  statsSection?: SectionHeadingContent;
  estimatorSection?: SectionHeadingContent;
  videoSection?: SectionHeadingContent & { videoUrl?: string };
  rosterSection?: SectionHeadingContent;
  servicesSection?: SectionHeadingContent;
  testimonialsSection?: SectionHeadingContent;
  faqSection?: SectionHeadingContent & { items?: FaqContent[] };
  cta?: CtaContent;
}

export interface ServicesPageDoc extends PageBase {
  _type: "servicesPage";
  header?: PageHeaderContent;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  cta?: CtaContent;
}

export interface CreatorsPageDoc extends PageBase {
  _type: "creatorsPage";
  header?: PageHeaderContent;
  cta?: CtaContent;
}

export interface TeamPageDoc extends PageBase {
  _type: "teamPage";
  header?: PageHeaderContent;
  tierTaglines?: { managers?: string; seniors?: string; staff?: string };
  cta?: CtaContent;
}

export interface SchedulePageDoc extends PageBase {
  _type: "schedulePage";
  hero?: {
    eyebrow?: string;
    title?: string;
    body?: string;
    steps?: { title?: string; body?: string }[];
    readout?: string;
  };
  confirmation?: BookingConfirmationContent;
  statsSection?: SectionHeadingContent;
  testimonialsSection?: SectionHeadingContent;
}

/** Copy for the post-submit thank-you takeover on Book a Call. */
export interface BookingConfirmationContent {
  eyebrow?: string;
  title?: string;
  body?: string;
  nextSteps?: { title?: string; body?: string }[];
  readout?: string;
}

export interface CareersPageDoc extends PageBase {
  _type: "careersPage";
  header?: PageHeaderContent;
  openingsSection?: SectionHeadingContent;
  noOpenings?: string;
  whySection?: SectionHeadingContent;
  perks?: { tag?: string; title?: string; body?: string }[];
  cta?: CtaContent;
}

/** One careers-page role card. */
export interface CmsJob {
  title: string;
  department: string;
  location?: string;
  type?: string;
  comp?: string;
  blurb: string;
  tags?: string[];
  applyHref: string;
}

export type PageDoc =
  | HomePageDoc
  | ServicesPageDoc
  | CreatorsPageDoc
  | TeamPageDoc
  | SchedulePageDoc
  | CareersPageDoc;
