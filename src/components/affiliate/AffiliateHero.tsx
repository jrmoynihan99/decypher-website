import Image from "next/image";
import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import type { AffiliatePageDoc } from "@/sanity/types";

type HeroContent = NonNullable<AffiliatePageDoc["hero"]>;

/**
 * The partner hero: pitch on the left, the partner's face on the right with
 * their own words riding on it.
 *
 * Not PageHeader — that one is centered with no room for an image, and the
 * whole point here is the pairing. A visitor arrives from someone they already
 * trust, so the endorsement has to land in the same glance as the headline;
 * pushing it to a testimonial section further down would spend that trust on
 * scrolling.
 *
 * The CTA jumps to the booking panel rather than /schedule-team: the call is already
 * on this page, and sending them to the generic booking page would drop the
 * partner's context and re-ask the income question this call doesn't need.
 */
export default function AffiliateHero({
  content,
  partnerName,
  imageUrl,
}: {
  content: HeroContent;
  partnerName?: string;
  imageUrl?: string;
}) {
  const quote = content.quote;

  return (
    <SectionReveal>
      <header className="relative z-[1] mx-auto max-w-[1220px] px-6 pb-[70px] pt-[92px] sm:pt-[110px]">
        <GlowOrb size={820} blur={52} alpha={0.2} beta={0.12} duration={15} />

        <div className="relative grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr] lg:gap-14">
          <div className="text-center lg:text-left">
            {content.badge && (
              <SubheadingReveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-teal/35 bg-teal/[0.08] px-3.5 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-teal">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-teal"
                  />
                  {content.badge}
                </span>
              </SubheadingReveal>
            )}

            <h1 className="mt-6 font-display text-[clamp(38px,5.4vw,62px)] font-bold leading-[1.04] tracking-[-0.03em]">
              <DecryptOnView
                as="span"
                text={content.headlineLine1 ?? ""}
                threshold={0}
                className="block text-fog"
              />
              <DecryptOnView
                as="span"
                text={content.headlineLine2 ?? ""}
                threshold={0}
                className="text-grad block"
              />
            </h1>

            {content.body && (
              <ParagraphReveal
                delay={0.3}
                className="mx-auto mt-6 max-w-[54ch] text-[clamp(15.5px,1.8vw,18px)] leading-relaxed text-mist [text-wrap:pretty] lg:mx-0"
              >
                {content.body}
              </ParagraphReveal>
            )}

            <Reveal
              delay={0.55}
              className="mt-8 flex flex-col items-center gap-3 lg:items-start"
            >
              <ConsultButton size="lg" href="#book">
                {content.ctaLabel ?? "Book your free call"}
              </ConsultButton>
              {content.ctaNote && (
                <p className="m-0 font-mono text-[11px] tracking-[0.08em] text-dusk">
                  {content.ctaNote}
                </p>
              )}
            </Reveal>
          </div>

          <Reveal delay={0.4} className="relative mx-auto w-full max-w-[460px]">
            <PartnerFrame
              imageUrl={imageUrl}
              partnerName={partnerName}
              hasQuote={!!quote?.text}
            />

            {quote?.text && (
              <figure className="relative z-[2] -mt-14 ml-4 mr-4 rounded-[18px] border border-white/12 bg-panel/95 p-5 md:backdrop-blur-xl">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,45,120,.5),transparent)]"
                />
                <blockquote className="m-0 text-[14.5px] leading-relaxed text-fog">
                  <span aria-hidden className="mr-1 text-magenta">
                    &ldquo;
                  </span>
                  {quote.text}
                  <span aria-hidden className="ml-0.5 text-magenta">
                    &rdquo;
                  </span>
                </blockquote>
                {quote.attribution && (
                  <figcaption className="mt-3 font-mono text-[10.5px] tracking-[0.14em] text-dusk">
                    {quote.attribution.toUpperCase()}
                  </figcaption>
                )}
              </figure>
            )}
          </Reveal>
        </div>
      </header>
    </SectionReveal>
  );
}

/**
 * The partner's image, or an honest gap where it goes. The placeholder is
 * styled rather than hidden so an unfinished page still reads as designed —
 * and so a missing asset is obvious to whoever's filling the page in.
 */
function PartnerFrame({
  imageUrl,
  partnerName,
  hasQuote,
}: {
  imageUrl?: string;
  partnerName?: string;
  hasQuote: boolean;
}) {
  return (
    <div
      className={`relative aspect-[4/5] overflow-hidden rounded-[22px] border border-edge bg-panel ${
        hasQuote ? "" : "mb-0"
      }`}
    >
      {imageUrl ? (
        <>
          <Image
            src={imageUrl}
            alt={partnerName ? `${partnerName}` : ""}
            fill
            sizes="(max-width: 1024px) 90vw, 460px"
            className="object-cover"
            priority
          />
          {/* floors the bottom of the frame so the quote card has something to
              sit against instead of fighting the photo for contrast */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,10,14,.92)_0%,rgba(10,10,14,.35)_38%,transparent_65%)]"
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,rgba(139,43,232,.2),transparent_62%)]">
          <div className="absolute inset-4 rounded-[16px] border border-dashed border-edge-bright" />
          <div className="relative text-center">
            <div
              aria-hidden
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-edge-bright text-[18px] text-faint"
            >
              ◎
            </div>
            <p className="mb-0 mt-4 font-mono text-[10.5px] tracking-[0.2em] text-dusk">
              AWAITING_ASSET
            </p>
            {partnerName && (
              <p className="mb-0 mt-1.5 font-mono text-[10.5px] tracking-[0.14em] text-faint">
                {partnerName.toUpperCase()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
