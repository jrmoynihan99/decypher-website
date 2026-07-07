import type { Metadata } from "next";
import NeuralWeb from "@/components/effects/NeuralWeb";
import StatsSection from "@/components/home/StatsSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import ScheduleForm from "@/components/schedule/ScheduleForm";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";

export const metadata: Metadata = {
  title: "Book a Call — DeCypher Financials",
  description:
    "Book a free consultation. Twenty minutes, zero jargon — we look at your creator business and tell you exactly where the savings are hiding.",
};

/** What actually happens on the call — set next to the form. */
const CALL_STEPS = [
  {
    num: "01",
    title: "We scan your setup",
    body: "Entity, books, filings — where you are today.",
  },
  {
    num: "02",
    title: "We name the savings",
    body: "The strategies we'd run and what they're worth.",
  },
  {
    num: "03",
    title: "You decide",
    body: "Work with us, or walk away with the plan. No pressure.",
  },
];

export default function SchedulePage() {
  return (
    <main className="relative">
      {/* one continuous mesh from the hero through the proof, fading out
          under the reviews reel */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />

        {/* hero: the pitch on the left, the form as the hero's content */}
        <SectionReveal>
          <section className="relative z-[1] mx-auto grid max-w-[1200px] items-start gap-12 px-6 pb-[100px] pt-[80px] lg:grid-cols-[1fr_520px] lg:gap-16">
            <GlowOrb
              size={780}
              blur={54}
              alpha={0.2}
              beta={0.12}
              duration={16}
              style={{ top: "-160px", left: "calc(25% - 390px)" }}
            />

            <div className="relative text-center lg:pt-6 lg:text-left">
              <SubheadingReveal>
                <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
                  [ schedule // free consultation ]
                </p>
              </SubheadingReveal>
              <DecryptOnView
                as="h1"
                text="Book your decryption call."
                threshold={0}
                style={{ maxWidth: "14ch" }}
                className="mx-auto mt-[18px] font-display text-[clamp(38px,4.6vw,62px)] font-bold leading-[1.05] tracking-[-0.03em] text-fog lg:mx-0"
              />
              <ParagraphReveal
                delay={0.3}
                className="mx-auto mt-[22px] max-w-[48ch] text-[clamp(15.5px,1.7vw,17.5px)] leading-relaxed text-mist [text-wrap:pretty] lg:mx-0"
              >
                Twenty minutes, zero jargon. We look at your numbers, tell you
                exactly what we’d do, and you decide if we’re your team.
              </ParagraphReveal>

              <ol className="mx-auto mt-9 flex max-w-[420px] list-none flex-col gap-5 p-0 text-left lg:mx-0">
                {CALL_STEPS.map((s, i) => (
                  <li key={s.num}>
                    <Reveal
                      delay={0.5 + i * 0.12}
                      className="flex items-start gap-4"
                    >
                      <span className="mt-[3px] flex-none font-mono text-[12px] tracking-[0.14em] text-magenta">
                        [{s.num}]
                      </span>
                      <span>
                        <b className="block font-display text-[16.5px] font-semibold tracking-[-0.01em] text-fog">
                          {s.title}
                        </b>
                        <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">
                          {s.body}
                        </span>
                      </span>
                    </Reveal>
                  </li>
                ))}
              </ol>

              <SubheadingReveal delay={0.9} className="mt-9">
                <p className="m-0 font-mono text-[11.5px] tracking-[0.16em] text-faint">
                  {"// AVG RESPONSE TIME < 24 HOURS "}
                  <span className="animate-blink text-magenta">▮</span>
                </p>
              </SubheadingReveal>
            </div>

            <Reveal delay={0.35}>
              <ScheduleForm />
            </Reveal>
          </section>
        </SectionReveal>

        {/* the proof */}
        <StatsSection eyebrow="[ 01 // the proof ]" />

        {/* the receipts */}
        <TestimonialsSection eyebrow="[ 02 // reviews ]" />
      </div>
    </main>
  );
}
