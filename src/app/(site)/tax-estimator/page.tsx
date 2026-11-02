import type { Metadata } from "next";
import Link from "next/link";
import WaveField from "@/components/effects/WaveField";
import TaxEstimator from "@/components/estimator/TaxEstimator";
import Reveal from "@/components/reveal/Reveal";
import PageHeader from "@/components/ui/PageHeader";
import { socialMetadata } from "@/lib/seo";
import { getPageBySlug } from "@/sanity/queries";
import type { SectionHeadingContent } from "@/sanity/types";

/**
 * The 60-second tax estimator on its own URL, so ads and FAQ answers can link
 * straight to it. Same component as the home page section (lead capture
 * included), and the same heading copy: it's read from Home → Estimator in
 * Studio rather than duplicated, so the two never disagree.
 */

// Safety net only — content updates land instantly via the Sanity webhook.
export const revalidate = 86400;

const PATH = "/tax-estimator";
const FALLBACK_TITLE = "Estimate your tax bill";

async function estimatorCopy(): Promise<SectionHeadingContent> {
  const home = await getPageBySlug("/");
  return (home?._type === "homePage" && home.estimatorSection) || {};
}

export async function generateMetadata(): Promise<Metadata> {
  const copy = await estimatorCopy();
  const title = "Creator Tax Estimator | DeCypher Financials";
  return {
    title,
    description: copy.sub,
    ...socialMetadata({ title, description: copy.sub, path: PATH }),
  };
}

export default async function TaxEstimatorPage() {
  const copy = await estimatorCopy();
  return (
    <main className="relative">
      <section className="relative z-[1] px-4 pb-20 md:px-6 md:pb-[120px]">
        <WaveField />
        <PageHeader
          eyebrow="[ tax estimator ]"
          title={copy.title ?? FALLBACK_TITLE}
          titleMax="16ch"
          sub={copy.sub}
        />
        <Reveal amount={0.15} className="mx-auto mt-6 w-full max-w-[760px] md:mt-8">
          <TaxEstimator />
        </Reveal>
        <p className="relative mx-auto mb-0 mt-10 text-center font-mono text-[12px] tracking-[0.1em] text-dusk">
          {"// questions about your numbers? "}
          <Link href="/faq" className="text-mist no-underline transition-colors hover:text-magenta">
            Read the Creator Tax FAQ →
          </Link>
        </p>
      </section>
    </main>
  );
}
