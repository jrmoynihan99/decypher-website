"use client";

import { useEffect, useRef } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  TESTIMONIALS_ROW_A,
  TESTIMONIALS_ROW_B,
  Testimonial,
} from "@/lib/content";
import {
  cancelDecrypt,
  decryptTo,
  prefersReducedMotion,
  scramble,
} from "@/lib/decrypt";

/** Repeat a row enough times for a seamless -50% marquee loop. */
const repeat = <T,>(arr: T[], n: number): T[] =>
  Array.from({ length: n }, () => arr).flat();

const ROW_A = repeat(TESTIMONIALS_ROW_A, 4);
const ROW_B = repeat(TESTIMONIALS_ROW_B, 4);

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="m-0 flex w-[400px] flex-none flex-col gap-5 rounded-[18px] border border-edge-mid bg-panel p-7 transition-colors duration-300 hover:border-[#3A3746]">
      <blockquote
        data-quote
        className="m-0 min-h-[100px] text-[15.5px] leading-[1.62] text-[#D9D4E4]"
      >
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <figcaption className="flex items-center gap-3.5">
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full border border-edge-bright bg-panel-2 font-mono text-sm tracking-[0.08em] text-muted">
          {t.initials}
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <b className="font-display text-[15px] font-semibold text-fog">
            {t.name}
          </b>
          <span className="font-mono text-[11.5px] text-dusk">
            {t.handle} · {t.followers}
          </span>
        </span>
        <span
          className="ml-auto flex-none rounded-full border px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.1em]"
          style={{ color: t.accent, borderColor: t.accentBorder }}
        >
          {t.cat}
        </span>
      </figcaption>
    </figure>
  );
}

export default function TestimonialsSection() {
  const marqueeRef = useRef<HTMLDivElement>(null);

  // quotes ship scrambled and decrypt (staggered) when the reel scrolls into view
  useEffect(() => {
    const sec = marqueeRef.current;
    if (!sec || prefersReducedMotion()) return;
    const quotes = Array.from(
      sec.querySelectorAll<HTMLQuoteElement>("[data-quote]"),
    );
    if (!quotes.length) return;
    const targets = quotes.map((q) => q.textContent ?? "");
    quotes.forEach((q, i) => (q.textContent = scramble(targets[i])));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.disconnect();
          quotes.forEach((q, i) =>
            timers.push(
              setTimeout(() => decryptTo(q, targets[i], 1100), (i % 4) * 220),
            ),
          );
        }
      },
      { threshold: 0.15 },
    );
    io.observe(sec);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      quotes.forEach((q, i) => {
        cancelDecrypt(q);
        q.textContent = targets[i];
      });
    };
  }, []);

  return (
    <section id="reviews" className="relative z-[1] pb-[130px] pt-[120px]">
      <SectionHeading
        eyebrow="[ 06 // reviews ]"
        title="Creators who cracked the code."
        sub="// hover to pause the reel"
        subMono
        glowDuration={16}
      />
      <div
        ref={marqueeRef}
        className="mt-[54px] overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]"
      >
        <div className="flex w-max animate-marquee gap-5 px-6 pt-2.5 [animation-duration:58s] hover:[animation-play-state:paused]">
          {ROW_A.map((t, i) => (
            <TestimonialCard key={`a-${i}`} t={t} />
          ))}
        </div>
        <div className="flex w-max animate-marquee-rev gap-5 px-6 pb-2.5 pt-5 [animation-duration:72s] hover:[animation-play-state:paused]">
          {ROW_B.map((t, i) => (
            <TestimonialCard key={`b-${i}`} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
