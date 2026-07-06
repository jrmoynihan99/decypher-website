"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hub: boolean;
  color: string;
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

    const COLORS = ["#FF2D78", "#8B2BE8", "#FF5C2E"];
    const LINK = 130; // node↔node link distance (px)
    const MOUSE_R = 190; // cursor link / attraction radius (px)
    const MAX_SPD = 0.55; // px per 60fps-frame speed cap

    let w = 0;
    let h = 0;
    let nodes: Node[] = [];

    const seed = () => {
      // density scales with area so wide sections don't look sparse
      const count = Math.max(30, Math.min(90, Math.round((w * h) / 16000)));
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
        };
      });
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = w;
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    let last = 0;
    const draw = (t: number) => {
      // normalize physics to 60fps so speed doesn't depend on refresh rate
      const dtF = last ? Math.min(2, (t - last) / 16.7) : 1;
      last = t;
      ctx.clearRect(0, 0, w, h);

      const rect = canvas.getBoundingClientRect();
      const mx = pointer.cx - rect.left;
      const my = pointer.cy - rect.top;
      const mouseOn = mx > -MOUSE_R && mx < w + MOUSE_R && my > -MOUSE_R && my < h + MOUSE_R;

      for (const n of nodes) {
        if (mouseOn) {
          const dx = mx - n.x;
          const dy = my - n.y;
          const d = Math.hypot(dx, dy);
          if (d < MOUSE_R && d > 1) {
            const f = (1 - d / MOUSE_R) * 0.028 * dtF;
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
        const spd = Math.hypot(n.vx, n.vy);
        if (spd > MAX_SPD) {
          n.vx = (n.vx / spd) * MAX_SPD;
          n.vy = (n.vy / spd) * MAX_SPD;
        }
        n.x += n.vx * dtF;
        n.y += n.vy * dtF;
        // wrap with a margin so nodes glide off one edge and onto the other
        if (n.x < -20) n.x = w + 20;
        else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        else if (n.y > h + 20) n.y = -20;
      }

      // mesh edges (violet, faint)
      ctx.strokeStyle = "#8B2BE8";
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
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
        ctx.strokeStyle = "#FF2D78";
        for (const n of nodes) {
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
        if (n.hub) {
          ctx.globalAlpha = 0.18 * opacity;
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.85 * opacity;
        ctx.fillStyle = n.color;
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

    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
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
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });

    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [opacity]);

  return (
    <div
      ref={wrapRef}
      data-glow
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className ?? ""}`}
      style={style}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
