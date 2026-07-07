"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor-tracking spotlight for cards: eases `--mx` / `--my` CSS vars on the
 * element toward the pointer via a rAF spring (rather than snapping), so a
 * radial highlight trails the cursor smoothly. On first entry the light is
 * placed under the cursor so it doesn't fly in. Coordinates are recomputed
 * per move, so it stays correct even while the card rides a marquee.
 *
 * Attach `ref`, `onMouseMove`, and `onMouseLeave` to the card, then paint an
 * overlay with `radial-gradient(... at var(--mx,50%) var(--my,0%) ...)`.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const follow = useRef({
    tx: 0,
    ty: 0,
    cx: 0,
    cy: 0,
    raf: 0,
    running: false,
    entered: false,
  });

  useEffect(() => {
    const f = follow.current;
    return () => {
      if (f.raf) cancelAnimationFrame(f.raf);
    };
  }, []);

  const run = () => {
    const s = follow.current;
    if (s.running) return;
    s.running = true;
    const step = () => {
      const k = 0.16; // easing stiffness — lower = more trailing lag
      s.cx += (s.tx - s.cx) * k;
      s.cy += (s.ty - s.cy) * k;
      const el = ref.current;
      if (el) {
        el.style.setProperty("--mx", `${s.cx.toFixed(1)}px`);
        el.style.setProperty("--my", `${s.cy.toFixed(1)}px`);
      }
      if (Math.abs(s.tx - s.cx) < 0.5 && Math.abs(s.ty - s.cy) < 0.5) {
        s.running = false;
        s.raf = 0;
        return;
      }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  };

  const onMouseMove = (e: React.MouseEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = follow.current;
    s.tx = e.clientX - r.left;
    s.ty = e.clientY - r.top;
    if (!s.entered) {
      s.entered = true;
      s.cx = s.tx;
      s.cy = s.ty;
      el.style.setProperty("--mx", `${s.cx.toFixed(1)}px`);
      el.style.setProperty("--my", `${s.cy.toFixed(1)}px`);
    }
    run();
  };

  const onMouseLeave = () => {
    follow.current.entered = false;
  };

  return { ref, onMouseMove, onMouseLeave };
}
