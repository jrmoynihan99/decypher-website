"use client";

import { useEffect, useRef, useState } from "react";
import ScaleReveal from "@/components/reveal/ScaleReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import { prefersReducedMotion } from "@/lib/decrypt";

/**
 * Video placeholder frame: scales up and glows as it approaches the center
 * of the viewport; the play button reveals the "paste your embed" note until
 * a real video is wired in.
 */
export default function VideoSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const glow = glowRef.current;
    if (!wrap) return;
    const reduced = prefersReducedMotion();
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const r = wrap.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - vh / 2) / vh;
      const s = Math.max(0, Math.min(1, (1 - d) * 1.35));
      if (!reduced) wrap.style.transform = `scale(${(0.86 + 0.14 * s).toFixed(3)})`;
      if (glow) glow.style.opacity = (s * 0.9).toFixed(2);
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
    <section id="video" className="relative z-[1] px-6 pb-[130px] pt-[60px]">
      <SectionHeading
        eyebrow="[ 03 // transmission ]"
        title="Watch the method."
        sub="Three minutes on how DeCypher turns creator chaos into a tax strategy that pays for itself."
        glowDuration={19}
      />
      <ScaleReveal className="relative mx-auto mt-[58px] max-w-[980px]">
        <div
          ref={glowRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-[6%] -bottom-[6%] top-[8%] opacity-0 blur-[64px]"
          style={{
            background:
              "radial-gradient(ellipse at center,rgba(255,45,120,.32),rgba(139,43,232,.20) 55%,rgba(10,10,14,0) 78%)",
          }}
        />
        <div
          ref={wrapRef}
          // NB: [transform:...] not scale-[.88] — Tailwind v4 scale utilities
          // use the standalone `scale` property, which would keep multiplying
          // against the scroll handler's inline `transform` scale.
          className="relative aspect-video overflow-hidden rounded-[22px] border border-edge-mid bg-[linear-gradient(160deg,#16141D,#0D0B13)] shadow-[0_30px_80px_rgba(0,0,0,.55)] [transform:scale(.88)]"
        >
          {/* grid backdrop */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
          <div className="absolute left-[22px] top-[18px] flex items-center gap-2 font-mono text-[11.5px] tracking-[0.18em] text-muted">
            <span className="h-2 w-2 animate-blink rounded-full bg-[#FF3B3B] [animation-duration:1.4s]" />
            REC
          </div>
          <div className="absolute right-[22px] top-[18px] font-mono text-[11.5px] tracking-[0.18em] text-muted">
            16:9 // 03:12
          </div>
          <button
            aria-label="Play video"
            onClick={() => setPlayed(true)}
            className={`bg-grad absolute left-1/2 top-1/2 flex h-[94px] w-[94px] -translate-x-1/2 -translate-y-1/2 animate-pulse-ring cursor-pointer items-center justify-center rounded-full border-none pl-2 text-[28px] text-white transition-opacity duration-400 ${
              played ? "pointer-events-none opacity-0" : ""
            }`}
          >
            ▶
          </button>
          <div className="absolute inset-x-0 bottom-[18px] text-center font-mono text-[11.5px] tracking-[0.16em] text-faint">
            {"// HOW_DECYPHER_WORKS.MP4 — replace with your embed"}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 animate-scan bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.04)_0px,rgba(255,255,255,.04)_1px,transparent_1px,transparent_4px)] transition-opacity duration-[600ms] ${
              played ? "opacity-0" : "opacity-100"
            }`}
          />
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-night/90 transition-opacity duration-500 ${
              played ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className="m-0 font-mono text-[13px] tracking-[0.12em] text-mist">
              {"// paste your YouTube embed here — 16:9"}
            </p>
          </div>
        </div>
      </ScaleReveal>
    </section>
  );
}
