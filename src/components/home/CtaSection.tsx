import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";

export default function CtaSection() {
  return (
    <SectionReveal>
      <section className="relative z-[1] overflow-x-clip px-6 pb-[150px] pt-[60px] text-center">
        <GlowOrb size={840} blur={56} alpha={0.22} beta={0.14} duration={14} />
        <DecryptOnView
          as="h2"
          text="Ready to decrypt your savings?"
          className="relative mx-auto max-w-[18ch] font-display text-[clamp(36px,5.4vw,68px)] font-bold leading-[1.04] tracking-[-0.03em] text-fog"
        />
        <ParagraphReveal
          delay={0.2}
          className="relative mx-auto mt-[22px] max-w-[44ch] text-[17px] leading-relaxed text-mist"
        >
          Book a free consultation. If we can’t find you savings, you’ll know
          in one call.
        </ParagraphReveal>
        <Reveal delay={0.4} className="relative mt-9">
          <ConsultButton size="xl" />
        </Reveal>
        <SubheadingReveal delay={0.55} className="relative mt-[22px]">
          <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
            {"// WEEKLY MODEL — CANCEL ANYTIME. NO YEARLY CONTRACTS."}
          </p>
        </SubheadingReveal>
      </section>
    </SectionReveal>
  );
}
