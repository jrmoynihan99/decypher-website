import type { PortableTextBlock } from "next-sanity";
import { absoluteUrl, siteUrl } from "@/lib/site-url";
import type {
  CmsFaqCategory,
  CmsFaqPage,
  CmsFaqQuestion,
  FaqCtaCopy,
  FaqNextStep,
} from "@/sanity/types";

/**
 * The Creator Tax FAQ's helpers: paths, copy defaults and the structured data.
 * Content is all Sanity (sidebar → Creator Tax FAQ); see docs/FAQ.md.
 */

export const FAQ_PATH = "/faq";
export const ESTIMATOR_PATH = "/tax-estimator";

export function questionPath(slug: string): string {
  return `${FAQ_PATH}/${slug}`;
}

export function hubPath(hash?: string): string {
  return `${FAQ_PATH}${hash ? `#${hash}` : ""}`;
}

/** A category's jump link on the hub: "S-Corp & entity" → "s-corp-and-entity". */
export function categoryAnchor(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── copy ──────────────────────────────────────────────────────────────
   Every string has a fallback so a half-filled FAQ Page still renders a
   whole page. The fallbacks are the launch copy the import seeded. */

const DEFAULTS = {
  eyebrow: "[ creator tax faq ]",
  title: "Creator Tax FAQ",
  author: { name: "Otavio Mayole", jobTitle: "Co-founder" },
  cta: {
    booking: {
      prompt: "Full-time creator? Book a free consultation and see what you could be saving.",
      button: "Book a free consultation",
    },
    masterClass: {
      prompt: "Want the full list of what creators can write off?",
      button: "Watch the free Write Off Master Class",
    },
    estimator: {
      prompt: "Want a number for your own year? The estimator takes 60 seconds, no login.",
      button: "Try the tax estimator",
    },
  },
  disclaimer:
    "These answers are general information, not tax or legal advice, and not guarantees. Every creator's situation is different.",
  footerLine:
    "This answer is part of the DeCypher Financials Creator Tax FAQ, a collection of the questions our clients ask us most.",
};

export function faqByline(page: CmsFaqPage | null): string {
  const name = page?.author?.name || DEFAULTS.author.name;
  const job = page?.author?.jobTitle || DEFAULTS.author.jobTitle;
  return `${name}, ${job}, DeCypher Financials`;
}

export const faqDisclaimer = (page: CmsFaqPage | null) => page?.disclaimer || DEFAULTS.disclaimer;
export const faqFooterLine = (page: CmsFaqPage | null) => page?.footerLine || DEFAULTS.footerLine;
export const faqEyebrow = (page: CmsFaqPage | null) => page?.eyebrow || DEFAULTS.eyebrow;
export const faqTitle = (page: CmsFaqPage | null) => page?.title || DEFAULTS.title;

/**
 * The CTA box for a question's Next step. `href` undefined = the site's
 * consultation button. Master Class without a link set falls back to booking
 * rather than shipping a dead button.
 */
export function faqCta(
  page: CmsFaqPage | null,
  kind: FaqNextStep = "booking",
): { prompt: string; button: string; href?: string } {
  const pick = (copy: FaqCtaCopy | undefined, d: { prompt: string; button: string }) => ({
    prompt: copy?.prompt || d.prompt,
    button: copy?.button || d.button,
  });
  if (kind === "masterClass" && page?.cta?.masterClass?.url) {
    return { ...pick(page.cta.masterClass, DEFAULTS.cta.masterClass), href: page.cta.masterClass.url };
  }
  if (kind === "estimator") {
    return { ...pick(page?.cta?.estimator, DEFAULTS.cta.estimator), href: ESTIMATOR_PATH };
  }
  return pick(page?.cta?.booking, DEFAULTS.cta.booking);
}

/* ── text ──────────────────────────────────────────────────────────── */

/** The short answer trimmed to 155 characters at a word boundary. */
export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "…";
}

type TableBlock = { _type: "table"; rows?: { cells?: string[] }[] };
type TextBlock = { _type: string; children?: { text?: string }[] };

/** An answer body as plain text, tables included — for the structured data. */
export function bodyText(blocks: PortableTextBlock[] | undefined): string {
  return (blocks ?? [])
    .map((b) => {
      if (b._type === "table") {
        return ((b as unknown as TableBlock).rows ?? []).map((r) => (r.cells ?? []).join(" ")).join(" ");
      }
      return ((b as TextBlock).children ?? []).map((c) => c.text ?? "").join("");
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/* ── structured data ─────────────────────────────────────────────────────
   FAQPage markup for machine readability (search engines, AI assistants),
   not rich results, which Google no longer shows broadly. No QAPage: that's
   for user-submitted answers. The organization's street address is left out
   until its city and state are confirmed. */

const orgId = () => `${siteUrl()}/#organization`;
const authorId = () => `${siteUrl()}/#author`;

function organizationNode() {
  return {
    "@type": "Organization",
    "@id": orgId(),
    name: "DeCypher Financials",
    legalName: "DeCypher Financials, LLC",
    url: siteUrl(),
    description: "Bookkeeping, tax strategy and tax filing for U.S. content creators.",
  };
}

function authorNode(page: CmsFaqPage | null) {
  return {
    "@type": "Person",
    "@id": authorId(),
    name: page?.author?.name || DEFAULTS.author.name,
    jobTitle: page?.author?.jobTitle || DEFAULTS.author.jobTitle,
    worksFor: { "@id": orgId() },
  };
}

/** Hub: the hub shows each short answer, so its FAQPage markup uses the short answers. */
export function hubJsonLd(page: CmsFaqPage | null, categories: CmsFaqCategory[], updatedAt: string | null) {
  const hubUrl = absoluteUrl(FAQ_PATH);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      authorNode(page),
      {
        "@type": "FAQPage",
        "@id": `${hubUrl}#faq`,
        url: hubUrl,
        name: faqTitle(page),
        ...(updatedAt && { dateModified: updatedAt }),
        author: { "@id": authorId() },
        publisher: { "@id": orgId() },
        mainEntity: categories.flatMap((c) =>
          c.questions.map((q) => ({
            "@type": "Question",
            name: q.question,
            url: absoluteUrl(questionPath(q.slug)),
            acceptedAnswer: { "@type": "Answer", text: q.shortAnswer, url: absoluteUrl(questionPath(q.slug)) },
          })),
        ),
      },
    ],
  };
}

/** Question page: FAQPage with one question, plus breadcrumbs, author and organization. */
export function questionJsonLd(page: CmsFaqPage | null, item: CmsFaqQuestion) {
  const url = absoluteUrl(questionPath(item.slug));
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      authorNode(page),
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        url,
        name: item.question,
        dateModified: item.updatedAt,
        author: { "@id": authorId() },
        publisher: { "@id": orgId() },
        mainEntity: [
          {
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: `${item.shortAnswer} ${bodyText(item.body)}`.trim(),
              url,
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Creator Tax FAQ", item: absoluteUrl(FAQ_PATH) },
          { "@type": "ListItem", position: 3, name: item.question, item: url },
        ],
      },
    ],
  };
}
