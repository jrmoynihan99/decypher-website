import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import type { AffiliatePageDoc, PartnerQuote } from "@/sanity/types";

type QuotesContent = NonNullable<AffiliatePageDoc["partnerQuotes"]>;

const DEFAULT_EYEBROW = "[ 04 // in their words ]";

/**
 * The partner on DeCypher, first-person. Distinct from the review carousel
 * below it — that one is the site's whole roster and runs on every page; this
 * one is the person the visitor actually followed here. It reads as a transcript
 * rather than a card grid because it usually is one: several lines pulled from a
 * single conversation, not testimonials gathered from strangers.
 *
 * The lead quote gets the weight; the rest corroborate it.
 */
export default function PartnerQuotes({ content }: { content: QuotesContent }) {
  const quotes = content.quotes ?? [];
  if (quotes.length === 0) return null;

  const attributed = withInheritedSpeakers(quotes);
  const [lead, ...rest] = attributed;

  return (
    <section className="relative z-[1] mx-auto max-w-[1100px] px-6 pb-[90px] pt-[30px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? DEFAULT_EYEBROW}
        title={content.title ?? ""}
      />

      <SectionReveal amount={0.12} className="mt-12">
        <Reveal delay={0.1}>
          <figure className="relative m-0 overflow-hidden rounded-[22px] border border-edge bg-panel p-7 sm:p-9">
            {/* the rail: marks this as one speaker's thread, not a card */}
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] bg-[linear-gradient(to_bottom,#ff5c2e,#ff2d78_45%,#8b2be8)]"
            />
            <span
              aria-hidden
              className="text-grad pointer-events-none absolute right-5 top-1 select-none font-display text-[90px] font-bold leading-none opacity-[0.14]"
            >
              &rdquo;
            </span>
            <blockquote className="relative m-0 max-w-[46ch] font-display text-[clamp(19px,2.4vw,26px)] font-medium leading-[1.4] tracking-[-0.015em] text-fog [text-wrap:pretty]">
              {lead.quote}
            </blockquote>
            {lead.attribution && (
              <figcaption className="relative mt-5 font-mono text-[10.5px] tracking-[0.16em] text-dusk">
                {lead.attribution.toUpperCase()}
              </figcaption>
            )}
          </figure>
        </Reveal>

        {rest.length > 0 && (
          <div
            className={`mt-5 grid gap-5 ${
              rest.length > 1 ? "md:grid-cols-2" : ""
            }`}
          >
            {rest.map((q, i) => (
              <Reveal key={`${q.quote.slice(0, 24)}-${i}`} delay={0.2 + i * 0.1}>
                <figure className="relative m-0 h-full rounded-[18px] border border-edge bg-panel/70 p-6">
                  <blockquote className="m-0 text-[15px] leading-relaxed text-mist [text-wrap:pretty]">
                    <span aria-hidden className="mr-1 text-magenta">
                      &ldquo;
                    </span>
                    {q.quote}
                    <span aria-hidden className="ml-0.5 text-magenta">
                      &rdquo;
                    </span>
                  </blockquote>
                  {q.attribution && (
                    <figcaption className="mt-4 font-mono text-[10px] tracking-[0.14em] text-faint">
                      {q.attribution.toUpperCase()}
                    </figcaption>
                  )}
                </figure>
              </Reveal>
            ))}
          </div>
        )}
      </SectionReveal>
    </section>
  );
}

/**
 * Carries the last named speaker down the list, so consecutive lines from one
 * conversation don't have to repeat the name — which is how the CMS field is
 * documented ("leave empty to keep the previous quote's speaker").
 *
 * A name is then only printed when it CHANGES. Resolving and displaying are
 * separate steps for a reason: the common case is three lines from one partner,
 * where stamping the same name under each card reads as three strangers who
 * happen to be called the same thing.
 */
function withInheritedSpeakers(quotes: PartnerQuote[]): PartnerQuote[] {
  let speaker: string | undefined;
  let shown: string | undefined;
  return quotes.map((q) => {
    if (q.attribution?.trim()) speaker = q.attribution.trim();
    const changed = speaker !== shown;
    if (changed) shown = speaker;
    return { quote: q.quote, attribution: changed ? speaker : undefined };
  });
}
