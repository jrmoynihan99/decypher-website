"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";
import { fxOff } from "@/lib/fx";
import { COARSE_FRAME_MS, isCoarsePointer } from "@/lib/perf";

/**
 * Flowing "wireframe wave" background: a stack of parallel lines warped by
 * layered sine motion so the whole ribbon slowly undulates. The cursor repels
 * nearby line segments (with a springy ease-back), so mousing across the
 * waves ripples them. Fills its nearest positioned ancestor; sits behind
 * content via -z-10 and never captures pointer events.
 */
export default function WaveField({
  lines = 24,
  spacing = 11,
  opacity = 0.5,
  className,
  style,
}: {
  /** Number of parallel lines in the ribbon. */
  lines?: number;
  /** Resting vertical distance between neighboring lines (px). */
  spacing?: number;
  /** Peak stroke opacity of the centermost line. */
  opacity?: number;
  className?: string;
  /** Inline overrides for the wrapper — e.g. bleed past the section + mask-fade. */
  style?: React.CSSProperties;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || fxOff("wave")) return;
    const reduce = prefersReducedMotion();
    // phones: lower backing-store cap + ~30fps loop (see lib/perf.ts) — the
    // wave motion is absolute-time-based, so skipped frames don't change it
    const coarse = isCoarsePointer();

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Latest pointer position in *client* coords; mapped into canvas space
    // every frame (one getBoundingClientRect per frame) so sticky/scrolling
    // ancestors can't leave the warp anchored to a stale spot.
    const pointer = { cx: -1e5, cy: -1e5 };
    let mx = -1e5;
    let my = -1e5;
    const onMove = (e: PointerEvent) => {
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
    };
    const onLeave = () => {
      pointer.cx = -1e5;
      pointer.cy = -1e5;
    };

    const WARP_R = 150; // cursor influence radius (px)
    const WARP_PUSH = 46; // max displacement at the cursor (px)
    const STEP = 10; // horizontal sampling interval (px)

    // reused per-line sample buffers (avoids reallocating every frame)
    const xs: number[] = [];
    const ys: number[] = [];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      const rect = canvas.getBoundingClientRect();
      // spring the eased cursor toward its target — this is what makes the
      // lines relax back smoothly instead of snapping
      mx += (pointer.cx - rect.left - mx) * 0.1;
      my += (pointer.cy - rect.top - my) * 0.1;

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#FF5C2E");
      grad.addColorStop(0.5, "#FF2D78");
      grad.addColorStop(1, "#8B2BE8");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      const mid = (lines - 1) / 2;
      const cy = h / 2;
      for (let i = 0; i < lines; i++) {
        const off = i - mid;
        // outer lines fade out so the ribbon has a soft edge
        ctx.globalAlpha = opacity * (0.22 + 0.78 * (1 - Math.abs(off) / (mid + 1)));

        // sample the line into buffers first…
        let n = 0;
        for (let x = -STEP; x <= w + STEP; x += STEP) {
          const u = x / w;
          // amplitude envelope: waves peak mid-width, calm at the edges
          const env = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
          // spacing "breathes" so lines bunch and fan apart as they flow
          const gap = spacing * (1 + 0.45 * Math.sin(u * 3.1 - t * 0.00038 + off * 0.05));
          let y =
            cy +
            off * gap +
            env *
              (30 * Math.sin(u * 5.4 + t * 0.00055 + off * 0.16) +
                19 * Math.sin(u * 9.2 - t * 0.0004 + off * 0.09) +
                11 * Math.sin(u * 2.3 + t * 0.00082));
          let px = x;
          // cursor warp: gaussian falloff push away from the eased pointer
          const dx = px - mx;
          const dy = y - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < WARP_R * WARP_R * 6) {
            const d = Math.sqrt(d2) || 1;
            const f = Math.exp(-d2 / (WARP_R * WARP_R)) * WARP_PUSH;
            px += (dx / d) * f * 0.35;
            y += (dy / d) * f;
          }
          xs[n] = px;
          ys[n] = y;
          n++;
        }

        // …then stroke a quadratic spline through the sample midpoints, so a
        // hard cursor warp bends the line into a curve instead of a corner
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let k = 1; k < n - 1; k++) {
          ctx.quadraticCurveTo(xs[k], ys[k], (xs[k] + xs[k + 1]) / 2, (ys[k] + ys[k + 1]) / 2);
        }
        ctx.lineTo(xs[n - 1], ys[n - 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    if (reduce) {
      draw(0);
      const ro = new ResizeObserver(() => {
        resize();
        draw(0);
      });
      ro.observe(wrap);
      return () => ro.disconnect();
    }

    // animate only while on screen
    let raf = 0;
    let lastDraw = 0;
    const minFrame = coarse ? COARSE_FRAME_MS : 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - lastDraw < minFrame) return;
      lastDraw = t;
      draw(t);
    };
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) {
        if (!raf) raf = requestAnimationFrame(loop);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(wrap);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });

    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lines, spacing, opacity]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className ?? ""}`}
      style={style}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
