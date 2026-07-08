"use client";

import { useEffect, useRef, useState } from "react";
import ScaleReveal from "@/components/reveal/ScaleReveal";
import SectionHeading from "@/components/ui/SectionHeading";
import { prefersReducedMotion } from "@/lib/decrypt";
import type { SectionHeadingContent } from "@/sanity/types";

/**
 * Video frame: scales up and glows as it approaches the center of the
 * viewport. With a videoUrl from the CMS it renders the real embed;
 * without one it shows the on-brand placeholder frame.
 */
export default function VideoSection({
  content,
}: {
  content: SectionHeadingContent & { videoUrl?: string };
}) {
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
    <section id="video" className="relative z-[1] px-4 pb-16 pt-10 md:px-6 md:pb-[130px] md:pt-[60px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub={content.sub}
        glowDuration={19}
      />
      <ScaleReveal className="relative mx-auto mt-8 max-w-[980px] md:mt-[58px]">
        <div
          ref={glowRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-[6%] -bottom-[6%] top-[8%] opacity-0 blur-[64px] pointer-coarse:blur-[30px]"
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
          {content.videoUrl ? (
            <iframe
              src={content.videoUrl}
              title={content.title ?? "Video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <>
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
            // pulse-ring animates box-shadow spread (a per-frame repaint) —
            // fine on desktop, jank on iOS over the live canvas, so it's off
            // on touch (the ▶ is obviously a play button without it)
            className={`bg-grad absolute left-1/2 top-1/2 flex h-[94px] w-[94px] -translate-x-1/2 -translate-y-1/2 animate-pulse-ring pointer-coarse:animate-none cursor-pointer items-center justify-center rounded-full border-none pl-2 text-[28px] text-white transition-opacity duration-400 ${
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
            // scan animates background-position (a per-frame repaint); hold it
            // static on touch — the lines stay, they just don't drift
            className={`pointer-events-none absolute inset-0 animate-scan pointer-coarse:animate-none bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.04)_0px,rgba(255,255,255,.04)_1px,transparent_1px,transparent_4px)] transition-opacity duration-[600ms] ${
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
            </>
          )}
        </div>
      </ScaleReveal>
    </section>
  );
}
