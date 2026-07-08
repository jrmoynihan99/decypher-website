"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import GlowOrb from "@/components/ui/GlowOrb";
import ConsultButton from "@/components/ui/ConsultButton";
import Marquee from "@/components/ui/Marquee";
import ParagraphReveal from "@/components/reveal/ParagraphReveal";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import type { Creator } from "@/lib/creators";
import {
  armHover,
  cancelDecrypt,
  decryptSegments,
  prefersReducedMotion,
} from "@/lib/decrypt";

export interface HeroContent {
  eyebrow?: string;
  headlineLine1?: string;
  headlineLine2?: string;
  body?: string;
  ctaLabel?: string;
  secondaryCtaLabel?: string;
  scrollHint?: string;
}

export default function Hero({
  content,
  creators,
}: {
  content: HeroContent;
  creators: Creator[];
}) {
  const line1 = content.headlineLine1 ?? "";
  const line2 = content.headlineLine2 ?? "";
  const strip = creators.slice(0, 16);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);

  // both headline lines decrypt as one continuous sweep, then arm hover scramble
  useEffect(() => {
    const e1 = line1Ref.current;
    const e2 = line2Ref.current;
    if (!e1 || !e2 || prefersReducedMotion()) return;
    decryptSegments(
      [
        { el: e1, text: line1 },
        { el: e2, text: line2 },
      ],
      undefined,
      () => {
        armHover(e1, false);
        armHover(e2, true);
      },
    );
    // decryptSegments has already painted the scrambled state (with its own
    // inline blur) synchronously, so the pre-hydration blur class can come
    // off in the same task without the finished copy ever being visible
    e1.classList.remove("decrypt-pending");
    e2.classList.remove("decrypt-pending");
    return () => {
      cancelDecrypt(e1);
      cancelDecrypt(e2);
      e1.textContent = line1;
      e2.textContent = line2;
      e2.removeAttribute("style");
    };
  }, [line1, line2]);

  return (
    <SectionReveal>
      <section className="relative z-[2] flex min-h-[92svh] flex-col items-center justify-center overflow-x-clip px-6 pb-[64px] pt-8 text-center">
        <GlowOrb size={860} blur={52} alpha={0.22} beta={0.13} duration={15} />

        <SubheadingReveal className="relative">
          <p className="m-0 font-mono text-[12.5px] uppercase tracking-[0.34em] text-magenta">
            {content.eyebrow}
          </p>
        </SubheadingReveal>
        <h1 className="relative mt-[22px] max-w-[1060px] font-display text-[clamp(44px,7.2vw,94px)] font-bold leading-[1.03] tracking-[-0.03em]">
          <span ref={line1Ref} className="decrypt-pending block text-fog">
            {line1}
          </span>
          <span ref={line2Ref} className="decrypt-pending block text-grad">
            {line2}
          </span>
        </h1>
        <ParagraphReveal
          delay={0.5}
          className="relative mt-[26px] max-w-[58ch] text-[clamp(16px,1.9vw,19px)] leading-relaxed text-mist [text-wrap:pretty]"
        >
          {content.body ?? ""}
        </ParagraphReveal>

        <Reveal
          delay={0.75}
          className="relative mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <ConsultButton size="lg">{content.ctaLabel}</ConsultButton>
          {content.secondaryCtaLabel && (
            <a
              href="#proof"
              className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
            >
              {content.secondaryCtaLabel}
            </a>
          )}
        </Reveal>

        {/* creator photo strip — reveals early, alongside the body copy.
            md padding is the clearance for the curve=32 arc + edge tilt;
            mobile is a flat native scroller (no arc, no edge fade). */}
        <Reveal
          delay={0.35}
          className="relative -mx-6 mt-4 self-stretch overflow-hidden py-3 md:pb-10 md:pt-8 md:[mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]"
        >
          <Marquee duration={64} curve={32} scrollDrive className="gap-4 md:gap-5">
            {[...strip, ...strip].map((c, i) => (
              <Image
                key={`${c.name}-${i}`}
                src={c.img}
                alt={c.name}
                width={230}
                height={280}
                className="h-[200px] w-[164px] flex-none rounded-2xl border border-edge bg-panel object-cover object-[50%_20%] md:h-[280px] md:w-[230px]"
              />
            ))}
          </Marquee>
        </Reveal>

        {content.scrollHint && (
          <SubheadingReveal
            delay={1.2}
            className="absolute inset-x-0 bottom-[26px]"
          >
            <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
              {content.scrollHint} <span className="animate-blink">▼</span>
            </p>
          </SubheadingReveal>
        )}
      </section>
    </SectionReveal>
  );
}
