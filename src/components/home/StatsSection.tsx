"use client";

import { useEffect, useRef } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import { STATS } from "@/lib/content";
import {
  cancelDecrypt,
  decryptTo,
  prefersReducedMotion,
  scramble,
} from "@/lib/decrypt";

/**
 * Proof stats: values sit scrambled until the grid scrolls into view, then
 * decrypt one by one while the redaction bar over each label wipes away.
 */
export default function StatsSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const valRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wipeRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const grid = gridRef.current;
    const vals = valRefs.current;
    const wipes = wipeRefs.current;
    if (!grid) return;
    if (prefersReducedMotion()) {
      wipes.forEach((w) => w && (w.style.transform = "scaleX(0)"));
      return;
    }
    vals.forEach((v, i) => {
      if (v) v.textContent = scramble(STATS[i].value);
    });
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.disconnect();
          STATS.forEach((stat, i) => {
            timers.push(
              setTimeout(() => {
                decryptTo(vals[i], stat.value, 1500);
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
      vals.forEach((v, i) => {
        cancelDecrypt(v);
        if (v) v.textContent = STATS[i].value;
      });
    };
  }, []);

  return (
    <section id="proof" className="relative z-[1] px-6 pb-[110px] pt-[100px]">
      <SectionHeading eyebrow="[ 01 // proof of work ]" title="Receipts, decrypted." />
      <div
        ref={gridRef}
        className="mx-auto mt-[52px] grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-[18px]"
      >
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className="relative rounded-[18px] border border-edge bg-panel px-7 py-8"
          >
            <div
              ref={(el) => {
                valRefs.current[i] = el;
              }}
              className="text-grad font-display text-[clamp(40px,4vw,56px)] font-bold leading-none tracking-[-0.02em]"
            >
              {stat.value}
            </div>
            <div className="relative mt-3.5 inline-block">
              <span className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-muted">
                {stat.label}
              </span>
              <span
                ref={(el) => {
                  wipeRefs.current[i] = el;
                }}
                aria-hidden
                className="absolute -inset-y-[3px] -inset-x-[5px] origin-left rounded bg-edge-mid transition-transform duration-[800ms] ease-[cubic-bezier(.7,0,.3,1)]"
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-[26px] text-center font-mono text-[11px] tracking-[0.14em] text-faint">
        {"// placeholder figures — swap in your real numbers"}
      </p>
    </section>
  );
}
