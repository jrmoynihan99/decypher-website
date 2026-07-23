/** Shapes returned by the fetch layer in src/sanity/queries.ts. */

import type { SanityImageSource } from "@sanity/image-url";
import type { PortableTextBlock } from "next-sanity";

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
  /** CDN avatar URL; absent falls back to initials. */
  img?: string;
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
  /** Shared across Home and every affiliate page — edited in one place. */
  faqs?: FaqContent[];
  /** Envelope for the estimator's lead email; env vars are the fallback. */
  leadEmail?: LeadEmailSettings;
}

/** CMS-editable sender for the estimate email (see lib/lead-email.ts). */
export interface LeadEmailSettings {
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
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
  /** Heading only — the questions come from Site Settings, shared with the affiliate pages. */
  faqSection?: SectionHeadingContent;
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
  };
  confirmation?: BookingConfirmationContent;
  videoWallSection?: SectionHeadingContent;
  statsSection?: SectionHeadingContent;
  testimonialsSection?: SectionHeadingContent;
}

/** Copy for the post-submit thank-you takeover on Book a Call. */
export interface BookingConfirmationContent {
  eyebrow?: string;
  title?: string;
  body?: string;
  /** The big "but first" pre-call video under the header. */
  video?: {
    eyebrow?: string;
    title?: string;
    videoUrl?: string;
  };
}

/** One card on the thank-you video wall. */
export interface CmsVideoTestimonial {
  name: string;
  handle: string;
  videoUrl: string;
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
  /** URL segment of the detail page (/careers/<slug>); "" on docs that predate it. */
  slug: string;
  department: string;
  location?: string;
  type?: string;
  comp?: string;
  blurb: string;
  tags?: string[];
  /** Optional VSL above the posting on the detail page (YouTube URL). */
  videoUrl?: string;
  /** Rich-text posting on the detail page; empty falls back to the blurb. */
  description?: PortableTextBlock[];
  applyHref: string;
}

/** One line on the affiliate value-stack receipt. */
export interface ValueStackItem {
  label: string;
  sublabel?: string;
  /** Display string, struck through at render, e.g. "$500.00". */
  price: string;
}

/** A partner's own words about DeCypher. */
export interface PartnerQuote {
  quote: string;
  /** Empty means "same speaker as the quote above". */
  attribution?: string;
}

/**
 * A partner landing page. Unlike every other PageDoc this type has many
 * documents — one per affiliate — so anything shared (stats, call steps, the
 * review carousel, the FAQ) is deliberately absent here and resolved by the
 * template instead.
 */
export interface AffiliatePageDoc extends PageBase {
  _type: "affiliatePage";
  partnerName?: string;
  /** Allowlisted key, not a URI. Empty = the shared affiliate call. */
  calendlyEvent?: string;
  hero?: {
    badge?: string;
    headlineLine1?: string;
    headlineLine2?: string;
    body?: string;
    ctaLabel?: string;
    ctaNote?: string;
    /** Raw Sanity image — the template gets a resolved URL, see RenderPage. */
    image?: SanityImageSource;
    quote?: { text?: string; attribution?: string };
  };
  valueStack?: {
    eyebrow?: string;
    title?: string;
    items?: ValueStackItem[];
    subtotal?: string;
    totalLabel?: string;
    totalValue?: string;
    footnote?: string;
  };
  partnerQuotes?: {
    eyebrow?: string;
    title?: string;
    quotes?: PartnerQuote[];
  };
}

export type PageDoc =
  | HomePageDoc
  | ServicesPageDoc
  | CreatorsPageDoc
  | TeamPageDoc
  | SchedulePageDoc
  | CareersPageDoc
  | AffiliatePageDoc;
