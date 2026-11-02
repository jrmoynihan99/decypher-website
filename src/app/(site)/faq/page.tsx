import type { Metadata } from "next";
import Link from "next/link";
import CipherRain from "@/components/effects/CipherRain";
import NeuralWeb from "@/components/effects/NeuralWeb";
import FaqCta from "@/components/faq/FaqCta";
import FaqTopicNav from "@/components/faq/FaqTopicNav";
import JsonLd from "@/components/JsonLd";
import GlowOrb from "@/components/ui/GlowOrb";
import {
  FAQ_PATH,
  categoryAnchor,
  faqByline,
  faqCta,
  faqDisclaimer,
  faqEyebrow,
  faqTitle,
  formatDate,
  hubJsonLd,
  questionPath,
} from "@/lib/faq";
import { socialMetadata } from "@/lib/seo";
import { urlFor } from "@/sanity/image";
import { getFaqHub } from "@/sanity/queries";

/**
 * The Creator Tax FAQ hub: every question with its short answer, grouped by
 * category. Each full answer lives only on its own page (/faq/<slug>) so
 * there's one canonical copy of it, and this page links there. All content is
 * Sanity: sidebar → Creator Tax FAQ.
 *
 * Plain static text on purpose — no decrypting headings, no reveals. The point
 * of the FAQ is to be read by crawlers and AI assistants as much as by people,
 * and an animated heading is gibberish to anything that snapshots mid-scramble.
 * The ambience (rain, mesh, glow) is all behind the text, never in it.
 */

// Safety net only — publishes land instantly via the Sanity webhook.
export const revalidate = 86400;

// The CTA box after the third category, then again at the end.
const CTA_AFTER_CATEGORY = 2;

export async function generateMetadata(): Promise<Metadata> {
  const { page } = await getFaqHub();
  const title = page?.seo?.title || "Creator Tax FAQ | DeCypher Financials";
  const description =
    page?.seo?.description ||
    "Real tax questions from full-time content creators, answered by the DeCypher Financials team.";
  return {
    title,
    description,
    ...socialMetadata({
      title,
      description,
      path: FAQ_PATH,
      image: page?.seo?.ogImage
        ? urlFor(page.seo.ogImage).width(1200).height(630).fit("crop").url()
        : undefined,
    }),
  };
}

// The hub's columns, shared by the two grids below the header: on desktop the
// topic rail on the left, the reading column, and (xl) an empty gutter as wide
// as the rail so the reading column stays centred under the header. Below lg
// it's the one 860px column, and the rail becomes a floating bar.
const columns =
  "mx-auto max-w-[860px] px-5 sm:px-8 lg:grid lg:max-w-none lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[210px_minmax(0,820px)_210px] xl:justify-center";

const sectionTitle =
  "m-0 font-display text-[clamp(24px,3vw,32px)] font-semibold leading-[1.15] tracking-[-0.02em] text-fog";
const monoLabel = "m-0 font-mono text-[11px] uppercase tracking-[0.22em]";
const textLink = "text-fog no-underline transition-colors hover:text-magenta";

export default async function FaqHubPage() {
  const { page, categories, updatedAt } = await getFaqHub();
  const total = categories.reduce((n, c) => n + c.questions.length, 0);
  const where = (page?.whereAreYou ?? []).filter((r) => r.situation && r.question?.slug);
  const cta = faqCta(page);

  return (
    <main className="relative">
      <JsonLd data={hubJsonLd(page, categories, updatedAt)} />
      {/* fixed full-screen, desktop only (CipherRain skips phones itself) */}
      <CipherRain />

      {/* the mesh sits behind the header only and fades out before the
          question list, which stays on plain ground for reading */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 160px, #000 55%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 160px, #000 55%, transparent 100%)",
          }}
        />
        <header className="relative mx-auto max-w-[860px] px-5 pb-6 pt-24 text-center sm:px-8 md:pt-[90px]">
          {/* same glow as PageHeader on the other subpages */}
          <GlowOrb
            size={760}
            blur={52}
            alpha={0.2}
            beta={0.12}
            duration={16}
            style={{ top: "calc(50% - 380px)" }}
          />
          <p className={`relative ${monoLabel} tracking-[0.3em] text-magenta`}>{faqEyebrow(page)}</p>
          <h1 className="relative mx-auto mt-[18px] max-w-[22ch] font-display text-[clamp(34px,5vw,60px)] font-bold leading-[1.05] tracking-[-0.03em] text-fog [text-wrap:balance]">
            {faqTitle(page)}
          </h1>
          {(page?.intro ?? []).map((line) => (
            <p
              key={line}
              className="relative mx-auto mb-0 mt-5 max-w-[56ch] text-[clamp(15.5px,1.8vw,18px)] leading-relaxed text-mist [text-wrap:pretty]"
            >
              {line}
            </p>
          ))}
          <p className="relative mb-0 mt-7 font-mono text-[11.5px] tracking-[0.12em] text-faint">
            {faqByline(page)}
            {updatedAt && (
              <>
                <span aria-hidden className="mx-2 text-edge-bright">
                  /
                </span>
                Updated <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
              </>
            )}
          </p>
          {page?.generalNote && (
            <p className="relative mb-0 mt-2 text-[13px] text-dusk">{page.generalNote}</p>
          )}
        </header>

        {/* where are you? — a situation-first way in */}
        {where.length > 0 && (
          <div className={columns}>
            <section
              aria-labelledby="where-are-you"
              className="relative mt-12 lg:col-start-2"
            >
              <h2 id="where-are-you" className={sectionTitle}>
                Where are you?
              </h2>
              <ul className="m-0 mt-6 list-none border-t border-edge p-0">
                {where.map((row) => (
                  <li
                    key={row.question!.slug}
                    className="grid gap-x-8 gap-y-1.5 border-b border-edge py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:items-baseline"
                  >
                    <span className="font-mono text-[13px] leading-snug text-mist">
                      <span aria-hidden className="mr-2 text-magenta">
                        ▸
                      </span>
                      {row.situation}
                    </span>
                    <a href={`#${row.question!.slug}`} className={`text-[15.5px] leading-snug ${textLink}`}>
                      {row.question!.question}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      <div className={`relative z-[1] pb-28 ${columns}`}>
        {/* index of every question */}
        <nav aria-labelledby="all-questions" className="mt-20 lg:col-start-2 lg:row-start-1">
          <h2 id="all-questions" className={sectionTitle}>
            All questions
          </h2>
          <p className="mb-0 mt-2 font-mono text-[11.5px] tracking-[0.14em] text-faint">
            {`// ${total} questions, ${categories.length} topics`}
          </p>
          <div className="mt-8 gap-10 md:columns-2">
            {categories.map((c) => (
              <section key={c.id} className="mb-8 break-inside-avoid">
                <p className={`${monoLabel} text-magenta`}>
                  <a href={`#${categoryAnchor(c.title)}`} className="text-magenta no-underline hover:text-fog">
                    {c.title}
                  </a>
                </p>
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                  {c.questions.map((q) => (
                    <li key={q.slug} className="text-[14.5px] leading-snug">
                      <a href={`#${q.slug}`} className="text-mist no-underline transition-colors hover:text-fog">
                        {q.question}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>

        {/* the rail's cell starts here, beside the questions, not the index */}
        <FaqTopicNav topics={categories.map((c) => ({ anchor: categoryAnchor(c.title), title: c.title }))} />

        {/* every question, short answer + a link to the full one */}
        <div className="lg:col-start-2 lg:row-start-2">
          {categories.map((c, i) => {
            const anchor = categoryAnchor(c.title);
            return (
              <div key={c.id}>
                <section id={anchor} aria-labelledby={`${anchor}-title`} className="mt-20 scroll-mt-28">
                  <p className={`${monoLabel} text-faint`}>
                    {`${String(i + 1).padStart(2, "0")} // ${c.questions.length} ${c.questions.length === 1 ? "question" : "questions"}`}
                  </p>
                  <h2 id={`${anchor}-title`} className={`${sectionTitle} mt-2`}>
                    {c.title}
                  </h2>
                  <div className="mt-6 border-b border-edge">
                    {c.questions.map((q) => (
                      <article key={q.slug} id={q.slug} className="scroll-mt-28 border-t border-edge py-6">
                        {/* prefetch off: every question link would prefetch as it
                            scrolls past; Providers prefetches on hover instead */}
                        <h3 className="m-0 font-display text-[clamp(17px,2vw,20px)] font-semibold leading-snug tracking-[-0.01em]">
                          <Link href={questionPath(q.slug)} prefetch={false} className={textLink}>
                            {q.question}
                          </Link>
                        </h3>
                        <p className="mb-0 mt-2.5 max-w-[64ch] text-[15.5px] leading-[1.68] text-mist">
                          {q.shortAnswer}
                        </p>
                        <Link
                          href={questionPath(q.slug)}
                          prefetch={false}
                          className="mt-3 inline-block font-mono text-[12px] tracking-[0.08em] text-magenta no-underline transition-colors hover:text-fog"
                        >
                          Read the full answer →
                        </Link>
                      </article>
                    ))}
                  </div>
                </section>
                {i === CTA_AFTER_CATEGORY && i < categories.length - 1 && (
                  <FaqCta text={cta.prompt} label={cta.button} />
                )}
              </div>
            );
          })}

          <FaqCta text={cta.prompt} label={cta.button} />

          <footer className="border-t border-edge pt-6">
            <p className="m-0 text-[13px] leading-relaxed text-dusk">{faqDisclaimer(page)}</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
