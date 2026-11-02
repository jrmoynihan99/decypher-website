import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import FaqCta from "@/components/faq/FaqCta";
import JsonLd from "@/components/JsonLd";
import RichText from "@/components/RichText";
import GlowOrb from "@/components/ui/GlowOrb";
import {
  categoryAnchor,
  faqByline,
  faqCta,
  faqDisclaimer,
  faqFooterLine,
  formatDate,
  hubPath,
  metaDescription,
  questionJsonLd,
  questionPath,
} from "@/lib/faq";
import { socialMetadata } from "@/lib/seo";
import { getAllFaqSlugs, getFaqQuestionBySlug } from "@/sanity/queries";

/**
 * One Creator Tax FAQ question (Sanity: Creator Tax FAQ → questions): the
 * short answer up top (the line an AI assistant is most likely to quote, and
 * the meta description), then the full answer. Static text throughout, like
 * the hub.
 *
 * Slugs are public URLs once live: renaming one in Studio needs a permanent
 * redirect from the old path in next.config.ts.
 */

// Safety net only — publishes land instantly via the Sanity webhook. A
// question published after the deploy renders on its first visit.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllFaqSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { question: item } = await getFaqQuestionBySlug(slug);
  if (!item) return {};
  const title = `${item.question} | DeCypher Financials`;
  const description = metaDescription(item.shortAnswer);
  return {
    title,
    description,
    ...socialMetadata({ title: item.question, description, path: questionPath(item.slug) }),
  };
}

const monoLabel = "m-0 font-mono text-[11px] uppercase tracking-[0.22em]";

export default async function FaqQuestionPage({ params }: Props) {
  const { slug } = await params;
  const { question: item, page } = await getFaqQuestionBySlug(slug);
  if (!item) notFound();

  const cta = faqCta(page, item.nextStep);

  return (
    <main className="relative">
      <JsonLd data={questionJsonLd(page, item)} />
      {/* fixed full-screen, desktop only (CipherRain skips phones itself) */}
      <CipherRain />

      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 140px, #000 30%, transparent 70%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 140px, #000 30%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-[760px] px-5 pb-28 pt-24 sm:px-8 md:pt-[90px]">
          {/* glow behind the question + short answer, as on the subpage headers */}
          <GlowOrb
            size={720}
            blur={52}
            alpha={0.18}
            beta={0.11}
            duration={16}
            style={{ top: "-120px" }}
          />
          <nav
            aria-label="Breadcrumb"
            className="relative font-mono text-[11px] uppercase tracking-[0.16em] text-dusk"
          >
            <Link href={hubPath()} className="text-dusk no-underline transition-colors hover:text-fog">
              Creator Tax FAQ
            </Link>
            {item.category && (
              <>
                <span aria-hidden className="mx-2 text-faint">
                  /
                </span>
                <Link
                  href={hubPath(categoryAnchor(item.category))}
                  className="text-dusk no-underline transition-colors hover:text-fog"
                >
                  {item.category}
                </Link>
              </>
            )}
          </nav>

          <article className="relative">
            <h1 className="m-0 mt-5 font-display text-[clamp(30px,4.6vw,46px)] font-bold leading-[1.1] tracking-[-0.025em] text-fog [text-wrap:balance]">
              {item.question}
            </h1>

            <div className="mt-8 border-l-2 border-magenta pl-5">
              <p className={`${monoLabel} text-magenta`}>Short answer</p>
              <p className="mb-0 mt-2 text-[clamp(17px,2vw,20px)] leading-relaxed text-fog [text-wrap:pretty]">
                {item.shortAnswer}
              </p>
            </div>

            <p className="mb-0 mt-6 font-mono text-[11.5px] tracking-[0.12em] text-faint">
              {faqByline(page)}
              <span aria-hidden className="mx-2 text-edge-bright">
                /
              </span>
              Updated <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
            </p>

            {item.body?.length > 0 && <RichText value={item.body} className="mt-10" />}
          </article>

          {item.related?.length > 0 && (
            <section aria-labelledby="related-title" className="relative mt-14">
              <h2
                id="related-title"
                className="m-0 font-display text-[clamp(21px,2.6vw,26px)] font-semibold leading-[1.2] tracking-[-0.02em] text-fog"
              >
                Related questions
              </h2>
              <ul className="m-0 mt-5 list-none border-t border-edge p-0">
                {item.related.map((r) => (
                  <li key={r.slug} className="border-b border-edge">
                    <Link
                      href={questionPath(r.slug)}
                      className="group flex items-baseline justify-between gap-4 py-4 text-[15.5px] leading-snug text-mist no-underline transition-colors hover:text-fog"
                    >
                      {r.question}
                      <span
                        aria-hidden
                        className="flex-none font-mono text-[13px] text-magenta transition-transform group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <FaqCta text={cta.prompt} label={cta.button} href={cta.href} />

          <p className="relative m-0">
            <Link
              href={hubPath(item.slug)}
              className="font-mono text-[12px] tracking-[0.08em] text-magenta no-underline transition-colors hover:text-fog"
            >
              ← Back to all FAQs
            </Link>
          </p>

          <footer className="relative mt-10 border-t border-edge pt-6 text-[13px] leading-relaxed text-dusk">
            <p className="m-0">
              {faqFooterLine(page)}{" "}
              <Link href={hubPath()} className="text-mist underline decoration-edge-bright underline-offset-4 hover:text-fog">
                See all questions
              </Link>{" "}
              or visit the{" "}
              <Link href="/" className="text-mist underline decoration-edge-bright underline-offset-4 hover:text-fog">
                DeCypher Financials homepage
              </Link>
              .
            </p>
            <p className="mb-0 mt-2">{faqDisclaimer(page)}</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
