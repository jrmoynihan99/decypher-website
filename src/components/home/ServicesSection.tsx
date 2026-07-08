"use client";

import { useEffect, useRef, useState } from "react";
import WaveField from "@/components/effects/WaveField";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { SERVICES } from "@/lib/content";
import { decryptTo } from "@/lib/decrypt";

/**
 * Sticky scroll-driven services deck: the section is 320vh tall; as you
 * scroll, a gradient progress line fills and the three service cards swap,
 * with each card's promise line re-decrypting as it arrives.
 */
export default function ServicesSection() {
  const outerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const total = Math.max(1, outer.offsetHeight - vh);
      const top = outer.getBoundingClientRect().top;
      const sp = Math.max(0, Math.min(1, -top / total));
      if (lineRef.current)
        lineRef.current.style.transform = `scaleY(${sp.toFixed(3)})`;
      const next = Math.min(2, Math.floor(sp * 3));
      if (next !== idxRef.current) {
        idxRef.current = next;
        setIdx(next);
        decryptTo(promiseRefs.current[next], SERVICES[next].promise);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section id="services" className="relative z-[1]">
      <div ref={outerRef} className="relative h-[320vh]">
        <div className="sticky top-0 flex h-svh items-center overflow-hidden">
          <WaveField />
          <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-center gap-12 px-7 pt-[70px]">
            {/* left column */}
            <div className="relative">
              <GlowOrb
                size={600}
                alpha={0.15}
                duration={18}
                style={{ left: -140, top: "calc(50% - 300px)" }}
              />
              <p className="relative m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
                [ 05 // services ]
              </p>
              <DecryptOnView
                as="h2"
                text="One stop shop for your creator business."
                className="relative mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog"
              />
              <p className="relative mt-[18px] max-w-[44ch] text-base leading-relaxed text-mist">
                No shopping around. Keep scrolling &mdash; each service decrypts
                as you go.
              </p>
              <div className="relative mt-9 flex items-center gap-4">
                <span className="font-mono text-sm tracking-[0.14em] text-magenta">
                  0{idx + 1} / 03
                </span>
                <span className="font-mono text-[11px] tracking-[0.14em] text-faint">
                  SCROLL ▼
                </span>
              </div>
            </div>

            {/* right column: progress line + swapping cards */}
            <div className="relative min-h-[620px]">
              <div className="absolute bottom-[8%] left-0 top-[8%] w-[2px] rounded-sm bg-edge">
                <div
                  ref={lineRef}
                  // NB: must be [transform:...] not scale-y-0 — Tailwind v4's
                  // scale utilities set the standalone `scale` property, which
                  // the scroll handler's inline `transform` can't override.
                  className="h-full w-full origin-top rounded-sm bg-[linear-gradient(#FF5C2E,#FF2D78,#8B2BE8)] shadow-[0_0_12px_rgba(255,45,120,.5)] [transform:scaleY(0)]"
                />
              </div>
              {SERVICES.map((svc, i) => {
                const active = i === idx;
                return (
                  <article
                    key={svc.num}
                    className={`absolute left-[38px] right-0 top-1/2 rounded-[20px] border border-edge-mid bg-panel px-6 pb-[34px] pt-6 transition-[opacity,transform] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${
                      active ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    style={{
                      transform: active
                        ? "translateY(-50%)"
                        : `translateY(calc(-50% + ${i < idx ? -46 : 46}px))`,
                    }}
                  >
                    {/* image slot placeholder — swap in a real service image */}
                    <div className="flex h-[210px] w-full items-center justify-center rounded-[14px] border border-edge bg-[#0F0E14]">
                      <span className="font-mono text-[11.5px] tracking-[0.16em] text-faint">
                        {svc.imgLabel}
                      </span>
                    </div>
                    <div className="px-3 pt-[26px]">
                      <div className="font-mono text-[13px] tracking-[0.14em] text-magenta">
                        {svc.num}
                      </div>
                      <h3 className="mt-3 font-display text-[clamp(22px,2.4vw,28px)] font-semibold tracking-[-0.01em] text-fog">
                        {svc.title}
                      </h3>
                      <p
                        ref={(el) => {
                          promiseRefs.current[i] = el;
                        }}
                        className="mb-4 mt-3 font-mono text-xs uppercase tracking-[0.16em] text-magenta"
                      >
                        {svc.promise}
                      </p>
                      <p className="m-0 max-w-[56ch] text-[15.5px] leading-[1.65] text-mist">
                        {svc.body}
                      </p>
                      {svc.chips && (
                        <div className="mt-[18px] flex flex-wrap gap-2.5">
                          {svc.chips.map((chip) => (
                            <span
                              key={chip}
                              className="rounded-full border border-edge-bright px-[13px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
