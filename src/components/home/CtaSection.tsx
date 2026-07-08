import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import type { CtaContent } from "@/sanity/types";

export default function CtaSection({ content }: { content: CtaContent }) {
  return (
    <SectionReveal>
      {/* No overflow-x-clip here (unlike the old markup): it clipped the glow's
          upward bleed into a hard line at the FAQ seam. The other sections don't
          clip either — horizontal-pan is already guarded on <body> in globals. */}
      <section className="relative z-[1] px-6 pb-20 pt-10 text-center md:pb-[150px] md:pt-[60px]">
        {/* anchorTop: this orb is a direct child of the (tall) section, not a
            top-anchored heading block, so without it the glow centers low and
            never reaches up into the FAQ above. */}
        <GlowOrb size={840} blur={56} alpha={0.22} beta={0.14} duration={14} anchorTop />
        <DecryptOnView
          as="h2"
          text={content.title ?? ""}
          className="relative mx-auto max-w-[18ch] font-display text-[clamp(36px,5.4vw,68px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
        />
        {content.body && (
          <ParagraphReveal
            delay={0.2}
            className="relative mx-auto mt-[22px] max-w-[44ch] text-[17px] leading-relaxed text-mist"
          >
            {content.body}
          </ParagraphReveal>
        )}
        <Reveal delay={0.4} className="relative mt-9">
          <ConsultButton size="xl">{content.ctaLabel}</ConsultButton>
        </Reveal>
        {content.readout && (
          <SubheadingReveal delay={0.55} className="relative mt-[22px]">
            <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
              {content.readout}
            </p>
          </SubheadingReveal>
        )}
      </section>
    </SectionReveal>
  );
}
