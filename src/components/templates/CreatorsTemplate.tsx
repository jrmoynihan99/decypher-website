import CreatorsExplorer from "@/components/creators/CreatorsExplorer";
import NeuralWeb from "@/components/effects/NeuralWeb";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ConsultButton from "@/components/ui/ConsultButton";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import PageHeader from "@/components/ui/PageHeader";
import Readout from "@/components/ui/Readout";
import type { Creator } from "@/lib/creators";
import type { CreatorsPageDoc } from "@/sanity/types";

export default function CreatorsTemplate({
  page,
  creators,
}: {
  page: CreatorsPageDoc;
  creators: Creator[];
}) {
  const header = page.header ?? {};
  const cta = page.cta ?? {};
  return (
    <main className="relative">
      {/* one continuous mesh from the header down through the database grid,
          fading in at the top and back out above the closing CTA */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 280px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 280px), transparent 100%)",
          }}
        />
        <PageHeader
          eyebrow={header.eyebrow ?? ""}
          title={header.title ?? ""}
          sub={header.sub}
          readout={
            header.readout && (
              <Readout
                text={header.readout}
                vars={{ count: creators.length }}
                blink
              />
            )
          }
        />
        <CreatorsExplorer creators={creators} />
      </div>

      {/* closing CTA */}
      <SectionReveal>
        <section className="relative z-[1] overflow-x-clip px-6 pb-[130px] pt-[30px] text-center">
          <GlowOrb size={760} blur={54} alpha={0.2} beta={0.12} duration={15} />
          <DecryptOnView
            as="h2"
            text={cta.title ?? ""}
            className="relative mx-auto max-w-[22ch] font-display text-[clamp(32px,4.6vw,56px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog"
          />
          {cta.body && (
            <ParagraphReveal
              delay={0.2}
              className="relative mx-auto mt-5 max-w-[46ch] text-[16.5px] leading-relaxed text-mist"
            >
              {cta.body}
            </ParagraphReveal>
          )}
          <Reveal
            delay={0.4}
            className="relative mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <ConsultButton size="lg" href={cta.ctaHref || undefined}>
              {cta.ctaLabel}
            </ConsultButton>
            {cta.secondaryCtaLabel && (
              <a
                href={cta.secondaryCtaHref ?? "/services"}
                className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
              >
                {cta.secondaryCtaLabel}
              </a>
            )}
          </Reveal>
          {cta.readout && (
            <SubheadingReveal delay={0.55} className="relative mt-[22px]">
              <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
                {cta.readout}
              </p>
            </SubheadingReveal>
          )}
        </section>
      </SectionReveal>
    </main>
  );
}
