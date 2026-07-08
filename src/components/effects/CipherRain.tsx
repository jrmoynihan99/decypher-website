"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { prefersReducedMotion, randChar } from "@/lib/decrypt";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fxOff } from "@/lib/fx";
import { noop } from "@/lib/noop";
import { COARSE_FRAME_MS, isCoarsePointer } from "@/lib/perf";

interface Drop {
  el: HTMLSpanElement;
  y: number;
  spd: number;
}

/**
 * Fixed full-screen background of vertical cipher strings that drift upward
 * continuously, flicker, and parallax against scroll.
 */
export default function CipherRain() {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  // Not rendered on phones: it's a full-screen `fixed inset-0` layer, and a
  // fixed element flush to the BOTTOM edge makes iOS 26 Safari paint the
  // home-indicator bar solid (same failure as the top nav — this layer is the
  // only such element unique to the home page, which is why only home showed a
  // black bottom bar). Also saves the per-drop compositing cost on mobile.
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b || prefersReducedMotion() || fxOff("rain")) return;

    const rand = (n: number) => Math.floor(Math.random() * n);
    const randStr = () => {
      let str = "";
      const len = 6 + rand(10);
      for (let j = 0; j < len; j++) str += randChar();
      return str;
    };

    const drops: Drop[] = [];
    const allSpans: HTMLSpanElement[] = [];
    const build = (
      layer: HTMLDivElement,
      count: number,
      size: number,
      spdMin: number,
      spdMax: number,
      colA: string,
      colB: string,
    ) => {
      for (let i = 0; i < count; i++) {
        const s = document.createElement("span");
        s.textContent = randStr();
        // drift is applied via transform (translate3d in vh units), never
        // `top` — a layout property on 66 spans per frame kept the whole
        // page's layout permanently dirty. will-change gives each drop its
        // own tiny layer so the drift is compositor-only work.
        s.style.cssText = `position:absolute;top:0;font-family:var(--font-mono);font-size:${size}px;letter-spacing:3px;writing-mode:vertical-rl;user-select:none;will-change:transform;`;
        s.style.left = `${rand(100)}%`;
        s.style.color = rand(2) ? colA : colB;
        const y = rand(250) - 30;
        s.style.transform = `translate3d(0,${y}vh,0)`;
        layer.appendChild(s);
        allSpans.push(s);
        drops.push({ el: s, y, spd: spdMin + Math.random() * (spdMax - spdMin) });
      }
    };
    // every drop is its own composited layer (will-change) updated per frame,
    // and this layer never pauses — on phones that compositing bill runs the
    // battery hot, so they get roughly viewport-density (narrow screen) and
    // the loop below drops to ~30fps
    const coarse = isCoarsePointer();
    build(a, coarse ? 12 : 38, 13, 1.6, 3.2, "rgba(255,45,120,.16)", "rgba(139,43,232,.20)");
    build(b, coarse ? 8 : 28, 16, 3.2, 5.6, "rgba(255,45,120,.24)", "rgba(255,92,46,.20)");

    // random flicker: re-randomize a few strings on a slow interval
    const flick = setInterval(() => {
      for (let k = 0; k < 3; k++) {
        const s = allSpans[rand(allSpans.length)];
        s.textContent = randStr();
        s.style.opacity = (0.35 + Math.random() * 0.65).toFixed(2);
      }
    }, 380);

    // constant upward drift, independent of scroll
    let raf = 0;
    let lastT = performance.now();
    const minFrame = coarse ? COARSE_FRAME_MS : 0;
    const loop = (t: number) => {
      if (t - lastT < minFrame) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(60, t - lastT) / 1000;
      lastT = t;
      for (const sp of drops) {
        sp.y -= sp.spd * dt;
        if (sp.y < -35) {
          sp.y += 260;
          sp.el.style.left = `${rand(100)}%`;
        }
        sp.el.style.transform = `translate3d(0,${sp.y.toFixed(2)}vh,0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // scroll parallax on each layer
    const onScroll = () => {
      const y = window.scrollY || 0;
      a.style.transform = `translateY(${(-y * 0.05).toFixed(1)}px)`;
      b.style.transform = `translateY(${(-y * 0.11).toFixed(1)}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearInterval(flick);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      a.replaceChildren();
      b.replaceChildren();
    };
  }, [isMobile]);

  if (isMobile) return null;

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2, ease: "easeOut" }}
      // JS-drive the fade (see lib/noop): dodges Safari's WAAPI-vs-view-
      // transition compositor flicker on this full-screen layer.
      onUpdate={noop}
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div ref={aRef} className="absolute inset-0 will-change-transform" />
      <div ref={bRef} className="absolute inset-0 will-change-transform" />
    </motion.div>
  );
}
