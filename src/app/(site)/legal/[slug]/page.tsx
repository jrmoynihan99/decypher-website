import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RichText from "@/components/RichText";
import { socialMetadata } from "@/lib/seo";
import { getAllLegalPageSlugs, getLegalPageBySlug } from "@/sanity/queries";

/**
 * Every legal document — privacy policy, terms of use, whatever comes next —
 * renders through here from Sanity. The whole body is CMS copy, not just the
 * variable bits: a legal page is exactly the kind of document that needs a typo
 * or an address change fixed in minutes without a deploy.
 *
 * The trade that buys: a change leaves no commit behind and passes through no
 * review. Take the copy to counsel before publishing rather than expecting the
 * CMS to stop anyone.
 *
 * Scope note — these documents cover the DeCypher PORTAL (the staff
 * application), not the marketing site, which has its own long-standing policy.
 * Keeping them separate is deliberate: the portal processes client financial
 * data pulled from QuickBooks, and Intuit's app review expects a policy that
 * actually describes that. A single blended document would be vaguer about both.
 *
 * These URLs are registered with Intuit, so a slug rename breaks a link someone
 * external is relying on.
 */

// Safety net only — publishes land instantly via the Sanity webhook.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllLegalPageSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getLegalPageBySlug(slug);
  if (!doc) return {};
  const title = doc.seo?.title ?? `${doc.title} — DeCypher Financials`;
  const description = doc.seo?.description;
  return {
    title,
    description,
    // Stated rather than left to the default: Intuit's reviewer has to be able
    // to reach these, and a stray noindex would be silent.
    robots: { index: true, follow: true },
    ...socialMetadata({ title, description, path: `/legal/${slug}` }),
  };
}

export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  const doc = await getLegalPageBySlug(slug);
  if (!doc) notFound();

  return (
    <main className="mx-auto max-w-[760px] px-5 pb-28 pt-32 sm:px-8 sm:pt-40">
      {doc.eyebrow ? (
        <p className="mb-4 font-mono text-[11.5px] uppercase tracking-[0.22em] text-magenta">
          {doc.eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-[clamp(28px,4.4vw,36px)] font-semibold leading-tight tracking-[-0.02em] text-fog">
        {doc.title}
      </h1>
      {doc.effectiveDate ? (
        <p className="mt-4 font-mono text-[11.5px] uppercase tracking-[1.2px] text-dusk">
          Effective {doc.effectiveDate}
        </p>
      ) : null}
      <RichText value={doc.body} className="mt-10" />
    </main>
  );
}
