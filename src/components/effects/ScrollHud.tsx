"use client";

import { useEffect, useRef } from "react";
import { setGlowHue } from "@/lib/glowHue";
import { isCoarsePointer } from "@/lib/perf";

/**
 * Scroll-as-decryption HUD: a gradient progress bar pinned to the top and a
 * "DECRYPTING… NN%" chip in the corner. Also hue-rotates every GlowOrb on the
 * page as scroll progress advances — as inline filter writes on the
 * `[data-glow]` elements (a handful of orbs; the canvas meshes rotate their
 * palettes in-draw via the shared glowHue module instead). Inline writes on
 * a few elements are the CHEAP option here: broadcasting one `--glow-hue`
 * variable on <html> looks tidier but an unregistered custom property
 * inherits, so every change invalidates the computed style of the ENTIRE
 * document — profiled at 25-44ms of forced style recalc per frame during a
 * smooth-scroll glide. The value is quantized (0.5° desktop, 6° on phones)
 * so the orb layers only re-rasterize when it actually changes, not on
 * every frame.
 */
export default function ScrollHud() {
  const barRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastPct = -1;
    let lastHue = NaN;
    // every step re-rasterizes each [data-glow] layer (big blurred orbs).
    // 0.5° is fine on desktop; phones step 6° so a full-page scroll costs
    // ~12 re-rasters instead of ~140.
    const hueStep = isCoarsePointer() ? 6 : 0.5;
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

      const hue = p * 70 - 15;
      setGlowHue(hue);
      const q = Math.round(hue / hueStep) * hueStep;
      if (q !== lastHue) {
        lastHue = q;
        const filter = `hue-rotate(${q}deg)`;
        document
          .querySelectorAll<HTMLElement>("[data-glow]")
          .forEach((g) => (g.style.filter = filter));
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
      // don't leak the home page's hue onto pages without a ScrollHud
      setGlowHue(0);
    };
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[200] h-[3px] bg-white/5">
        <div
          ref={barRef}
          className="h-full w-0 bg-[linear-gradient(90deg,#FF5C2E,#FF2D78,#8B2BE8)] shadow-[0_0_14px_rgba(255,45,120,0.65)]"
        />
      </div>
      {/* corner chip crowds a phone screen — the top bar carries the concept
          there on its own */}
      <div className="fixed bottom-[18px] left-[18px] z-[200] hidden items-center gap-2 rounded-lg border border-edge-mid bg-night/80 px-3 py-2 backdrop-blur-[8px] sm:flex">
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
