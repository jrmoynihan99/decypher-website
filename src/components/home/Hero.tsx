"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import GlowOrb from "@/components/ui/GlowOrb";
import ConsultButton from "@/components/ui/ConsultButton";
import Marquee from "@/components/ui/Marquee";
import { creators } from "@/lib/creators";
import {
  armHover,
  cancelDecrypt,
  decryptSegments,
  prefersReducedMotion,
} from "@/lib/decrypt";

const LINE_1 = "We decrypt";
const LINE_2 = "your tax savings.";

const STRIP = creators.slice(0, 16);

export default function Hero() {
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);

  // both headline lines decrypt as one continuous sweep, then arm hover scramble
  useEffect(() => {
    const e1 = line1Ref.current;
    const e2 = line2Ref.current;
    if (!e1 || !e2 || prefersReducedMotion()) return;
    decryptSegments(
      [
        { el: e1, text: LINE_1 },
        { el: e2, text: LINE_2 },
      ],
      undefined,
      () => {
        armHover(e1, false);
        armHover(e2, true);
      },
    );
    return () => {
      cancelDecrypt(e1);
      cancelDecrypt(e2);
      e1.textContent = LINE_1;
      e2.textContent = LINE_2;
      e2.removeAttribute("style");
    };
  }, []);

  return (
    <section className="relative z-[2] flex min-h-[92vh] flex-col items-center justify-center overflow-x-clip px-6 pb-[70px] pt-14 text-center">
      <GlowOrb size={860} blur={52} alpha={0.22} beta={0.13} duration={15} />

      <p className="relative m-0 font-mono text-[12.5px] uppercase tracking-[0.34em] text-magenta">
        [ Accounting for creators ]
      </p>
      <h1 className="relative mt-[22px] max-w-[1060px] font-display text-[clamp(44px,7.2vw,94px)] font-bold leading-[1.03] tracking-[-0.03em]">
        <span ref={line1Ref} className="block text-fog">
          {LINE_1}
        </span>
        <span ref={line2Ref} className="block text-grad">
          {LINE_2}
        </span>
      </h1>
      <p className="relative mt-[26px] max-w-[58ch] text-[clamp(16px,1.9vw,19px)] leading-relaxed text-mist [text-wrap:pretty]">
        Tax is a creator&rsquo;s biggest expense. We find the strategies hiding
        in your numbers &mdash; so you keep more of every brand deal,
        sponsorship, and payout.
      </p>

      <div className="relative mt-[38px] flex flex-wrap items-center justify-center gap-4">
        <ConsultButton size="lg" />
        <a
          href="#proof"
          className="rounded-full border border-edge-bright px-[30px] py-4 font-display text-[16.5px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
        >
          See the proof
        </a>
      </div>

      {/* creator photo strip */}
      <div className="relative mt-16 w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <Marquee duration={64} className="gap-5">
          {[...STRIP, ...STRIP].map((c, i) => (
            <Image
              key={`${c.name}-${i}`}
              src={c.img}
              alt={c.name}
              width={230}
              height={280}
              className="h-[280px] w-[230px] flex-none rounded-2xl border border-edge bg-panel object-cover object-[50%_20%]"
            />
          ))}
        </Marquee>
      </div>

      <p className="absolute inset-x-0 bottom-[26px] m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
        SCROLL TO DECRYPT <span className="animate-blink">▼</span>
      </p>
    </section>
  );
}
