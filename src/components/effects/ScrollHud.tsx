"use client";

import { useEffect, useRef } from "react";
import { fxOff } from "@/lib/fx";

/**
 * Scroll-as-decryption HUD: a gradient progress bar pinned to the top and a
 * "DECRYPTING… NN%" chip in the corner (both desktop-only).
 *
 * This used to also hue-rotate every [data-glow] glow layer as scroll
 * progress advanced. Removed on purpose: each filter change re-rasterizes
 * megapixel blurred orb layers, and a filter parked on an ANIMATING canvas
 * (the estimator WaveField) re-runs on every canvas frame — isolated via the
 * ?off= bisect as the dominant source of phone scroll jank. If scroll-reactive
 * color ever comes back, rotate palettes in-draw like NeuralWeb does; never
 * via a CSS filter on these layers.
 */
export default function ScrollHud() {
  const barRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (fxOff("hud")) return;
    let raf = 0;
    let lastPct = -1;
    const tick = () => {
      raf = 0;
      const y = window.scrollY || 0;
      const vh = window.innerHeight;
      const doc = document.documentElement.scrollHeight - vh;
      const p = doc > 0 ? Math.min(1, y / doc) : 0;

      if (barRef.current) barRef.current.style.width = `${(p * 100).toFixed(2)}%`;
      const pct = Math.round(p * 100);
      if (chipRef.current && pct !== lastPct) {
        lastPct = pct;
        chipRef.current.textContent =
          pct >= 100
            ? "ACCESS GRANTED — 100%"
            : `DECRYPTING… ${String(pct).padStart(2, "0")}%`;
        chipRef.current.style.color = pct >= 100 ? "#3DD6C4" : "#9A93AB";
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
    <>
      {/* the visible HUD is desktop-only — on phones the bar crowds the
          transparent nav and the chip crowds the screen; the hue rotation
          above still runs everywhere since the orbs/canvases depend on it */}
      <div className="fixed inset-x-0 top-0 z-[200] hidden h-[3px] bg-white/5 md:block">
        <div
          ref={barRef}
          className="h-full w-0 bg-[linear-gradient(90deg,#FF5C2E,#FF2D78,#8B2BE8)] shadow-[0_0_14px_rgba(255,45,120,0.65)]"
        />
      </div>
      <div className="fixed bottom-[18px] left-[18px] z-[200] hidden items-center gap-2 rounded-lg border border-edge-mid bg-night/80 px-3 py-2 backdrop-blur-[8px] md:flex">
        <span
          ref={chipRef}
          className="font-mono text-[11px] tracking-[0.14em] text-[#9A93AB]"
        >
          DECRYPTING… 00%
        </span>
        <span className="animate-blink font-mono text-[11px] text-magenta [animation-duration:1.1s]">
          ▮
        </span>
      </div>
    </>
  );
}
