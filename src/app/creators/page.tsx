import type { Metadata } from "next";
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
import { creators } from "@/lib/creators";

export const metadata: Metadata = {
  title: "Our Creators — DeCypher Financials",
  description:
    "From lifestyle to gaming to finance, we handle the books and the tax strategy so our creators can focus on what they do best.",
};

export default function CreatorsPage() {
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
          eyebrow="[ database // our creators ]"
          title="The creators we keep in the black."
          sub="From lifestyle to gaming to finance, we handle the books and the tax strategy so our creators can focus on what they do best."
          readout={
            <>
              {`// DATABASE ONLINE — ${creators.length} RECORDS `}
              <span className="animate-blink text-magenta">▮</span>
            </>
          }
        />
        <CreatorsExplorer />
      </div>

      {/* closing CTA */}
      <SectionReveal>
        <section className="relative z-[1] overflow-x-clip px-6 pb-[130px] pt-[30px] text-center">
          <GlowOrb size={760} blur={54} alpha={0.2} beta={0.12} duration={15} />
          <DecryptOnView
            as="h2"
            text="Your name belongs in this database."
            className="relative mx-auto max-w-[22ch] font-display text-[clamp(32px,4.6vw,56px)] font-bold leading-[1.05] tracking-[-0.025em] text-fog"
          />
          <ParagraphReveal
            delay={0.2}
            className="relative mx-auto mt-5 max-w-[46ch] text-[16.5px] leading-relaxed text-mist"
          >
            Join 150+ creators who keep more of every brand deal, sponsorship,
            and payout.
          </ParagraphReveal>
          <Reveal
            delay={0.4}
            className="relative mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <ConsultButton size="lg" />
            <a
              href="/services"
              className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
            >
              See what we do
            </a>
          </Reveal>
          <SubheadingReveal delay={0.55} className="relative mt-[22px]">
            <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
              {"// WEEKLY MODEL — CANCEL ANYTIME"}
            </p>
          </SubheadingReveal>
        </section>
      </SectionReveal>
    </main>
  );
}
