"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { prefersReducedMotion } from "@/lib/decrypt";
import { glowColor } from "@/lib/glowHue";
import { COARSE_FRAME_MS, isCoarsePointer } from "@/lib/perf";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hub: boolean;
  color: string;
  /** Inside the drawable window this frame (physics still runs when false). */
  in: boolean;
}

/**
 * Neural-network background: drifting nodes joined by lines whose opacity
 * grows as nodes near each other, so the mesh continually forms and breaks
 * apart. The cursor acts as an extra node — nearby nodes link to it with
 * brighter strands and get gently pulled toward it. Fills its nearest
 * positioned ancestor; sits behind content via -z-10, no pointer events.
 */
export default function NeuralWeb({
  opacity = 0.8,
  className,
  style,
}: {
  /** Master opacity multiplier for the whole layer. */
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
    if (!ctx) return;
    const reduce = prefersReducedMotion();
    // animated mode rotates the palette per draw (see glowHue.ts); reduced
    // motion renders ONE static frame, so it opts back into ScrollHud's
    // inline hue-rotate filter via data-glow instead — filtering a
    // never-repainting layer is cheap, and the scroll hue keeps applying
    const col = reduce ? (c: string) => c : glowColor;
    if (reduce) wrap.setAttribute("data-glow", "");

    const COLORS = ["#FF2D78", "#8B2BE8", "#FF5C2E"];
    const LINK = 130; // node↔node link distance (px)
    const MOUSE_R = 190; // cursor link / attraction radius (px)
    const MAX_SPD = 0.55; // px per 60fps-frame speed cap
    // phones: at least one of these canvases is intersecting at every scroll
    // position, so this loop is effectively always on — cap the backing store
    // at 1.5x (1px strokes at low alpha don't show the difference) and let
    // the loop below run at ~30fps instead of the display's 60/120
    const coarse = isCoarsePointer();
    const DPR_CAP = coarse ? 1.5 : 2;
    // The wrapper can span several sections; allocating (and clearing) a
    // full-height canvas texture every frame is the expensive part, so the
    // canvas is only viewport-sized (+margin) and slides down the wrapper to
    // track the visible band. Margin must exceed MOUSE_R so cursor strands
    // never get clipped at the window edge.
    const MARGIN = 220;

    let w = 0;
    let h = 0; // full wrapper height (node space)
    let vh = 0; // canvas window height
    let offY = 0; // window's offset down the wrapper
    let nodes: Node[] = [];

    const seed = () => {
      // density scales with area so wide sections don't look sparse
      const count = coarse
        ? Math.max(24, Math.min(60, Math.round((w * h) / 24000)))
        : Math.max(30, Math.min(90, Math.round((w * h) / 16000)));
      nodes = Array.from({ length: count }, () => {
        const hub = Math.random() < 0.12;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          r: hub ? 2.6 + Math.random() * 1.4 : 1.1 + Math.random() * 1.2,
          hub,
          color: COLORS[Math.random() < 0.45 ? 0 : Math.random() < 0.75 ? 1 : 2],
          in: true,
        };
      });
    };

    const resize = () => {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      const pw = w;
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      // reduced motion draws a single static frame, so it needs the full
      // height — there is no per-frame loop to slide the window
      vh = reduce ? h : Math.min(h, window.innerHeight + MARGIN * 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(vh * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${vh}px`;
      if (!nodes.length || Math.abs(w - pw) > 200) seed();
    };
    resize();

    // pointer tracked in client coords, mapped per frame (see WaveField)
    const pointer = { cx: -1e5, cy: -1e5 };
    const onMove = (e: PointerEvent) => {
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
    };
    const onLeave = () => {
      pointer.cx = -1e5;
      pointer.cy = -1e5;
    };
    // click-and-hold strengthens the pull; `grip` eases toward held-ness each
    // frame so the two modes blend instead of snapping
    let held = false;
    let grip = 0;
    const onDown = (e: PointerEvent) => {
      held = true;
      // a stationary touch never fires pointermove — seed the position here
      // so tap-and-hold pulls the mesh toward the finger
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      held = false;
      // touch has no hover: lifting the finger ends the interaction outright
      // instead of leaving strands anchored at the last contact point
      if (e.pointerType !== "mouse") onLeave();
    };

    let last = 0;
    const draw = (t: number) => {
      // normalize physics to 60fps so speed doesn't depend on refresh rate
      const dtF = last ? Math.min(2, (t - last) / 16.7) : 1;
      last = t;

      const rect = wrap.getBoundingClientRect();
      // slide the canvas window to the wrapper's visible band; drawing below
      // compensates via the context transform, so content stays put
      if (vh < h) {
        offY = Math.max(0, Math.min(h - vh, -rect.top - MARGIN));
        canvas.style.transform = `translate3d(0,${offY.toFixed(1)}px,0)`;
      } else if (offY) {
        offY = 0;
        canvas.style.transform = "";
      }
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, -offY * dpr);
      ctx.clearRect(0, offY, w, vh);
      // drawable band in node space, padded so nothing pops at the edges
      const wy0 = offY - LINK;
      const wy1 = offY + vh + LINK;

      const mx = pointer.cx - rect.left;
      const my = pointer.cy - rect.top;
      const mouseOn = mx > -MOUSE_R && mx < w + MOUSE_R && my > -MOUSE_R && my < h + MOUSE_R;

      // grip ramps 0→1 while held (≈0.3s) and back down on release; the
      // boosted force and speed cap ride it, so the hand-off is one curve
      grip += ((held ? 1 : 0) - grip) * (1 - Math.exp(-dtF * 0.12));
      const pull = 0.028 * (1 + grip * 4.5);
      const cap = MAX_SPD * (1 + grip * 2.2);

      for (const n of nodes) {
        if (mouseOn) {
          const dx = mx - n.x;
          const dy = my - n.y;
          const d = Math.hypot(dx, dy);
          if (d < MOUSE_R && d > 1) {
            const f = (1 - d / MOUSE_R) * pull * dtF;
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
        const spd = Math.hypot(n.vx, n.vy);
        if (spd > cap) {
          n.vx = (n.vx / spd) * cap;
          n.vy = (n.vy / spd) * cap;
        }
        n.x += n.vx * dtF;
        n.y += n.vy * dtF;
        // wrap with a margin so nodes glide off one edge and onto the other
        if (n.x < -20) n.x = w + 20;
        else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        else if (n.y > h + 20) n.y = -20;
        n.in = n.y > wy0 && n.y < wy1;
      }

      // mesh edges (violet, faint)
      ctx.strokeStyle = col("#8B2BE8");
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          // both endpoints outside the window → the link can't be visible
          // (the window is padded by LINK, longer links don't exist)
          if (!a.in && !b.in) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          ctx.globalAlpha = (1 - Math.sqrt(d2) / LINK) * 0.3 * opacity;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // cursor strands (magenta, brighter) — the "you're touching it" cue
      if (mouseOn) {
        ctx.strokeStyle = col("#FF2D78");
        for (const n of nodes) {
          if (!n.in) continue;
          const d = Math.hypot(n.x - mx, n.y - my);
          if (d > MOUSE_R) continue;
          ctx.globalAlpha = (1 - d / MOUSE_R) * 0.55 * opacity;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }

      // nodes on top; hubs get a soft halo
      for (const n of nodes) {
        if (!n.in) continue;
        const fill = col(n.color);
        if (n.hub) {
          ctx.globalAlpha = 0.18 * opacity;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.85 * opacity;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
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

    // Paint one frame synchronously on mount. The RAF loop below is gated
    // behind the IntersectionObserver, so it hasn't fired yet when a page's
    // view-transition snapshot is captured — without this the canvas is blank
    // in the snapshot and the whole mesh vanishes for the length of the wipe.
    draw(0);

    let raf = 0;
    // ~30fps on phones; the dtF clamp in draw() keeps physics speed identical
    const minFrame = coarse ? COARSE_FRAME_MS : 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < minFrame) return;
      draw(t);
    };
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) {
        if (!raf) {
          last = 0; // avoid a giant dt after being paused off-screen
          raf = requestAnimationFrame(loop);
        }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(wrap);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    // the wrapper's box doesn't necessarily change when only the viewport
    // height does, and the canvas window is sized to the viewport
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [opacity]);

  return (
    // no data-glow here: a CSS hue-rotate on a full-section canvas layer would
    // re-filter megapixels whenever the scroll hue changes — the draw loop
    // rotates its palette via lib/glowHue.ts instead (identical output)
    <motion.div
      ref={wrapRef}
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2, ease: "easeOut" }}
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className ?? ""}`}
      style={style}
    >
      <canvas
        ref={canvasRef}
        className="absolute left-0 top-0 will-change-transform"
      />
    </motion.div>
  );
}
