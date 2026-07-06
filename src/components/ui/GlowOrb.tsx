"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";

/** Global nudge to every glow's peak intensity (core + mid opacity). */
const GLOW_BOOST = 1.15;

/**
 * Ambient radial glow that drifts slowly behind a section and grows in the
 * first time it scrolls into view. The `data-glow` attribute lets the homepage
 * scroll HUD hue-rotate every orb (via `filter`) as you scroll — so the grow
 * uses `transform`/`opacity` only, to stay out of its way.
 */
export default function GlowOrb({
  size = 660,
  blur = 48,
  alpha = 0.16,
  beta = 0.1,
  duration = 17,
  className,
  style,
}: {
  size?: number;
  blur?: number;
  /** Opacity of the magenta core. */
  alpha?: number;
  /** Opacity of the violet mid-stop. */
  beta?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // "hidden" → "grow" (animate in) | "instant" (reduced motion, no animation)
  const [state, setState] = useState<"hidden" | "grow" | "instant">("hidden");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState(reduce ? "instant" : "grow");
          io.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = state !== "hidden";

  return (
    <div
      ref={ref}
      data-glow
      aria-hidden
      className={`pointer-events-none absolute ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        left: `calc(50% - ${size / 2}px)`,
        top: `calc(50% - ${size / 2}px)`,
        transform: shown ? "scale(1)" : "scale(0.35)",
        opacity: shown ? 1 : 0,
        transition:
          state === "instant"
            ? "none"
            : "transform 1.4s cubic-bezier(.2,.7,.2,1), opacity 1.1s ease-out",
        ...style,
      }}
    >
      <div
        className="h-full w-full animate-glow-drift rounded-full"
        style={{
          background: `radial-gradient(circle,rgba(255,45,120,${alpha * GLOW_BOOST}) 0%,rgba(139,43,232,${beta * GLOW_BOOST}) 45%,rgba(10,10,14,0) 72%)`,
          filter: `blur(${blur}px)`,
          animationDuration: `${duration}s`,
        }}
      />
    </div>
  );
}
