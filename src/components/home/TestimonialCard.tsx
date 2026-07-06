"use client";

import { useEffect, useRef } from "react";
import { Testimonial } from "@/lib/content";

/**
 * Frosted-glass testimonial card with a cursor-tracking spotlight that eases
 * toward the pointer (rAF spring, no snap) and a smooth hover lift. Mirrors the
 * stat cards. Card-local spotlight coords are recomputed per move, so it stays
 * correct even while the card rides the marquee.
 */
export default function TestimonialCard({ t }: { t: Testimonial }) {
  const ref = useRef<HTMLElement>(null);
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

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
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

  const onLeave = () => {
    follow.current.entered = false;
  };

  return (
    <figure
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="group relative m-0 w-[400px] flex-none overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.02] p-7 backdrop-blur-xl transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)]"
    >
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(360px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.15), transparent 68%)",
        }}
      />
      <div className="relative flex flex-col gap-5">
        <blockquote className="m-0 min-h-[100px] text-[15.5px] leading-[1.62] text-[#D9D4E4]">
          &ldquo;{t.quote}&rdquo;
        </blockquote>
        <figcaption className="flex items-center gap-3.5">
          <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full border border-edge-bright bg-panel-2 font-mono text-sm tracking-[0.08em] text-muted">
            {t.initials}
          </span>
          <span className="flex min-w-0 flex-col gap-[3px]">
            <b className="font-display text-[15px] font-semibold text-fog">
              {t.name}
            </b>
            <span className="font-mono text-[11.5px] text-dusk">
              {t.handle} · {t.followers}
            </span>
          </span>
          <span
            className="ml-auto flex-none rounded-full border px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.1em]"
            style={{ color: t.accent, borderColor: t.accentBorder }}
          >
            {t.cat}
          </span>
        </figcaption>
      </div>
    </figure>
  );
}
