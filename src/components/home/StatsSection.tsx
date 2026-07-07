"use client";

import { useEffect, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import SubheadingReveal from "@/components/reveal/SubheadingReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import { useSpotlight } from "@/hooks/useSpotlight";
import { STATS } from "@/lib/content";
import { prefersReducedMotion } from "@/lib/decrypt";

/**
 * Proof stats: values roll up (NumberFlow) as the grid scrolls into view while
 * the redaction bar over each label wipes away. Cards are frosted glass with a
 * cursor-tracking spotlight on hover.
 *
 * NB: NumberFlow renders its digits in Shadow DOM, so `background-clip: text`
 * gradients can't reach them — but `color` inherits across the shadow boundary,
 * so we tint the numerals a solid brand magenta.
 */

// split a display value like "$4.6M+" into { prefix:"$", num:4.6, suffix:"M+" }
function parseStat(v: string): { prefix: string; num: number; suffix: string } {
  const m = v.match(/^(\D*)([\d.]+)(.*)$/);
  if (!m) return { prefix: "", num: 0, suffix: v };
  return { prefix: m[1], num: parseFloat(m[2]), suffix: m[3] };
}

const PARSED = STATS.map((s) => parseStat(s.value));

export default function StatsSection({
  eyebrow = "[ 01 // proof of work ]",
  title = "Receipts, decrypted.",
}: {
  eyebrow?: string;
  title?: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const wipeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    STATS.map(() => false),
  );

  useEffect(() => {
    const grid = gridRef.current;
    const wipes = wipeRefs.current;
    if (!grid) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (prefersReducedMotion()) {
      // defer the state update out of the effect body (no cascading render)
      timers.push(setTimeout(() => setRevealed(STATS.map(() => true))));
      wipes.forEach((w) => w && (w.style.transform = "scaleX(0)"));
      return () => timers.forEach(clearTimeout);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.disconnect();
          STATS.forEach((_, i) => {
            timers.push(
              setTimeout(() => {
                setRevealed((prev) => {
                  const next = [...prev];
                  next[i] = true;
                  return next;
                });
                const w = wipes[i];
                if (w) w.style.transform = "scaleX(0)";
              }, i * 200),
            );
          });
        }
      },
      { threshold: 0.35 },
    );
    io.observe(grid);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <section id="proof" className="relative z-[1] px-6 pb-[110px] pt-[100px]">
      <SectionHeading eyebrow={eyebrow} title={title} />
      <div
        ref={gridRef}
        className="mx-auto mt-[52px] grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-[18px]"
      >
        {STATS.map((stat, i) => (
          <StatCard
            key={stat.label}
            stat={stat}
            p={PARSED[i]}
            value={revealed[i] ? PARSED[i].num : 0}
            registerWipe={(el) => {
              wipeRefs.current[i] = el;
            }}
          />
        ))}
      </div>
      <SubheadingReveal delay={0.2} className="mt-[26px] text-center">
        <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-faint">
          {"// placeholder figures — swap in your real numbers"}
        </p>
      </SubheadingReveal>
    </section>
  );
}

/**
 * A single frosted-glass stat card. The cursor spotlight (useSpotlight)
 * trails the pointer; the lift / border / glow ride CSS transitions.
 */
function StatCard({
  stat,
  p,
  value,
  registerWipe,
}: {
  stat: (typeof STATS)[number];
  p: { prefix: string; num: number; suffix: string };
  value: number;
  registerWipe: (el: HTMLSpanElement | null) => void;
}) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.045] px-7 py-8 backdrop-blur-xl transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)]"
    >
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.16), transparent 68%)",
        }}
      />
      <div className="relative">
        <NumberFlow
          value={value}
          prefix={p.prefix}
          suffix={p.suffix}
          format={{ maximumFractionDigits: 1 }}
          className="text-magenta font-display text-[clamp(40px,4vw,56px)] font-bold leading-none tracking-[-0.02em]"
        />
        <div className="relative mt-3.5 inline-block">
          <span className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-muted">
            {stat.label}
          </span>
          <span
            ref={registerWipe}
            aria-hidden
            className="absolute -inset-y-[3px] -inset-x-[5px] origin-left rounded bg-edge-mid transition-transform duration-[800ms] ease-[cubic-bezier(.7,0,.3,1)]"
          />
        </div>
      </div>
    </div>
  );
}
