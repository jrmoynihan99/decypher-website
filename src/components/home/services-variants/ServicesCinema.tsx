"use client";

import { useEffect, useRef, useState } from "react";
import ServicesTicker from "@/components/home/services-variants/ServicesTicker";
import DecryptOnView from "@/components/ui/DecryptOnView";
import GlowOrb from "@/components/ui/GlowOrb";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SERVICES } from "@/lib/content";
import { armHover, cancelDecrypt, decryptTo } from "@/lib/decrypt";

/**
 * SERVICES VARIANT 05 — "THE SEQUENCE"
 *
 * A cinematic scroll-scrub. The section pins to the viewport and scrolling
 * glides each service across a full-screen stage: a giant gradient numeral
 * drifts behind the copy at a slower parallax rate, chapters crossfade
 * continuously with scroll position (scrubbing, not stepping), and each
 * headline decrypts automatically the moment its chapter takes over. Nothing
 * to click, nothing to figure out — the scrollbar is the timeline. A side
 * rail shows progress; its ticks jump straight to a chapter if clicked.
 */

const FILE_TAGS = [
  "FILE 01 — TAX_STRATEGY.ENC",
  "FILE 02 — LLC_FILING.ENC",
  "FILE 03 — BOOKKEEPING.ENC",
];

export default function ServicesCinema() {
  const outerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const numRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const promiseRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const idxRef = useRef(-1);

  useEffect(() => {
    if (reduced) return;
    const outer = outerRef.current;
    if (!outer) return;
    let raf = 0;

    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const total = Math.max(1, outer.offsetHeight - vh);
      const top = outer.getBoundingClientRect().top;
      const sp = Math.max(0, Math.min(1, -top / total));
      // chapter coordinate: 0.5 = chapter 0 centered … 2.5 = chapter 2 centered
      const c = 0.5 + sp * 2;

      if (railFillRef.current)
        railFillRef.current.style.transform = `scaleY(${sp.toFixed(3)})`;

      // opacity curve: hold full brightness across a wide central band, then
      // fade fast at the edges — each chapter "owns" more of its scroll travel.
      const HOLD = 0.3; // half-width of the full-opacity plateau
      const EDGE = 0.52; // where a chapter has faded fully out
      let peak = 0;
      for (let i = 0; i < SERVICES.length; i++) {
        const t = c - (i + 0.5); // 0 when chapter i is centered
        const a = Math.abs(t);
        const vis =
          a <= HOLD ? 1 : a >= EDGE ? 0 : (EDGE - a) / (EDGE - HOLD);
        const eased = vis * vis * (3 - 2 * vis);
        if (eased > peak) peak = eased;
        const ch = chapterRefs.current[i];
        if (ch) {
          ch.style.opacity = eased.toFixed(3);
          ch.style.transform = `translateY(${(-t * 110).toFixed(1)}px)`;
        }
        const num = numRefs.current[i];
        if (num)
          num.style.transform = `translate(-50%,-50%) translateY(${(-t * 240).toFixed(1)}px)`;
      }

      // the stage glow swells as a chapter locks into center, dips on handoff
      if (glowRef.current)
        glowRef.current.style.filter = `brightness(${(0.85 + peak * 0.85).toFixed(3)})`;

      const idx = Math.max(0, Math.min(2, Math.floor(c)));
      if (idx !== idxRef.current && top < vh) {
        idxRef.current = idx;
        setActive(idx);
        if (counterRef.current)
          counterRef.current.textContent = `0${idx + 1}`;
        decryptTo(titleRefs.current[idx], SERVICES[idx].title, 460, () => {
          const el = titleRefs.current[idx];
          if (el) armHover(el);
        });
        decryptTo(promiseRefs.current[idx], SERVICES[idx].promise, 520);
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    tick();

    const titles = [...titleRefs.current];
    const promises = [...promiseRefs.current];
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      titles.forEach(cancelDecrypt);
      promises.forEach(cancelDecrypt);
    };
  }, [reduced]);

  const jumpTo = (i: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const outerTop = outer.getBoundingClientRect().top + window.scrollY;
    const total = Math.max(1, outer.offsetHeight - window.innerHeight);
    window.scrollTo({ top: outerTop + total * (i / 2) });
  };

  /* reduced motion: a plain, fully readable stack */
  if (reduced) {
    return (
      <section id="services" className="relative z-[1] px-6 pb-[120px] pt-[110px]">
        <div className="mx-auto max-w-[900px]">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
            [ 05 // services ]
          </p>
          <h2 className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-bold leading-[1.06] tracking-[-0.025em] text-fog">
            One stop shop for your creator business.
          </h2>
          <ServicesTicker className="mt-10" />
          <div className="mt-10 space-y-10">
            {SERVICES.map((svc, i) => (
              <article
                key={svc.num}
                className="rounded-[20px] border border-edge bg-panel p-7"
              >
                <p className="m-0 font-mono text-[11px] tracking-[0.2em] text-faint">
                  {FILE_TAGS[i]}
                </p>
                <h3 className="mt-3 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.015em] text-fog">
                  {svc.title}
                </h3>
                <p className="mb-0 mt-2 font-mono text-xs uppercase tracking-[0.16em] text-magenta">
                  {svc.promise}
                </p>
                <p className="mb-0 mt-3 text-[16px] leading-[1.65] text-mist">
                  {svc.body}
                </p>
                {svc.chips && (
                  <div className="mt-4 flex flex-wrap gap-2.5">
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
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="relative z-[1]">
      <div ref={outerRef} className="relative h-[340vh]">
        <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
          <div
            ref={glowRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-[filter] duration-300"
          >
            <GlowOrb size={780} alpha={0.14} duration={19} />
          </div>

          {/* deliverables ticker, pinned across the top of the stage */}
          <div className="absolute inset-x-0 top-[68px] px-6">
            <ServicesTicker className="mx-auto max-w-[1100px]" />
          </div>

          {/* header, pinned to the top of the stage */}
          <div className="pointer-events-none absolute inset-x-0 top-[132px] text-center">
            <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-magenta">
              [ 05 // services ]
            </p>
            <DecryptOnView
              as="h2"
              text="One stop shop for your creator business."
              threshold={0.1}
              className="mx-auto mt-3 max-w-[680px] font-display text-[clamp(20px,2.2vw,28px)] font-semibold tracking-[-0.02em] text-mist"
            />
          </div>

          {/* chapters */}
          {SERVICES.map((svc, i) => (
            <div
              key={svc.num}
              ref={(el) => {
                chapterRefs.current[i] = el;
              }}
              className={`absolute inset-0 flex items-center justify-center px-6 ${
                active === i ? "pointer-events-auto" : "pointer-events-none"
              }`}
              style={{ opacity: i === 0 ? 1 : 0 }}
            >
              {/* giant parallax numeral */}
              <div
                ref={(el) => {
                  numRefs.current[i] = el;
                }}
                aria-hidden
                className="text-grad pointer-events-none absolute left-1/2 top-1/2 select-none font-display text-[min(44vw,460px)] font-bold leading-none opacity-[0.08]"
                style={{ transform: "translate(-50%,-50%)" }}
              >
                {svc.num}
              </div>

              <div className="relative mx-auto max-w-[860px] text-center">
                <p className="m-0 font-mono text-[11px] tracking-[0.26em] text-faint">
                  {FILE_TAGS[i]}
                </p>
                <h3
                  ref={(el) => {
                    titleRefs.current[i] = el;
                  }}
                  className="mt-5 font-display text-[clamp(38px,6.4vw,78px)] font-bold leading-[1.02] tracking-[-0.03em] text-fog"
                >
                  {svc.title}
                </h3>
                <p
                  ref={(el) => {
                    promiseRefs.current[i] = el;
                  }}
                  className="mb-0 mt-5 font-mono text-[13px] uppercase tracking-[0.22em] text-magenta"
                >
                  {svc.promise}
                </p>
                <p className="mx-auto mb-0 mt-5 max-w-[58ch] text-[clamp(15.5px,1.6vw,18px)] leading-[1.7] text-mist">
                  {svc.body}
                </p>
                {svc.chips && (
                  <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                    {svc.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-edge-bright px-[14px] py-1.5 font-mono text-[11.5px] tracking-[0.1em] text-mist"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* progress rail */}
          <div className="absolute left-6 top-1/2 hidden -translate-y-1/2 md:block lg:left-12">
            <div className="relative h-[38vh] w-[2px] rounded bg-edge">
              <div
                ref={railFillRef}
                className="h-full w-full origin-top rounded bg-[linear-gradient(#FF5C2E,#FF2D78,#8B2BE8)] shadow-[0_0_10px_rgba(255,45,120,.5)] [transform:scaleY(0)]"
              />
              {SERVICES.map((svc, i) => (
                <button
                  key={svc.num}
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-label={`Jump to ${svc.title}`}
                  style={{ top: `${(i / 2) * 100}%` }}
                  className="group absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full border transition-all ${
                      active === i
                        ? "border-magenta bg-magenta shadow-[0_0_10px_rgba(255,45,120,.8)]"
                        : "border-edge-bright bg-night group-hover:border-magenta"
                    }`}
                  />
                  <span
                    className={`whitespace-nowrap font-mono text-[10px] tracking-[0.18em] transition-colors ${
                      active === i ? "text-fog" : "text-faint group-hover:text-mist"
                    }`}
                  >
                    {svc.num}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* footer readout */}
          <div className="absolute inset-x-0 bottom-[30px] flex items-center justify-center gap-4 font-mono text-[11px] tracking-[0.2em] text-faint">
            <span>
              <span ref={counterRef} className="text-magenta">
                01
              </span>{" "}
              / 03
            </span>
            <span className="hidden sm:inline">
              SCROLL TO SCRUB <span className="animate-blink">▼</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
