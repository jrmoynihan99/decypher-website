"use client";

import { useEffect, useRef, useState } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { prefersReducedMotion } from "@/lib/decrypt";
import { fxOff } from "@/lib/fx";
import { getRevealDelay } from "@/lib/transition-timing";

/** Global nudge to every glow's peak intensity (core + mid opacity). */
const GLOW_BOOST = 1.15;

/**
 * Ambient radial glow that drifts slowly behind a section and grows in the
 * first time it scrolls into view. The grow uses `transform`/`opacity` only —
 * anything touching `filter` on this layer re-rasterizes the huge blur, which
 * is why the scroll-driven hue-rotate was removed (see ScrollHud).
 *
 * Touch devices get a filter-FREE layer (see the `coarse` branch below): no
 * `blur()` at all, softness baked into the gradient stops, held static. A
 * radial gradient already reads as a glow; the blur was only smoothing it. On
 * a DPR-3 iPhone, blending several large blurred translucent layers over the
 * animating canvases every scroll frame is a fill-rate wall even when the blur
 * is static (it isn't scale-animated) — so mobile pays zero filter cost and
 * the layer never forces a continuous recomposite. Desktop is unchanged.
 */
export default function GlowOrb({
  size = 660,
  blur = 48,
  alpha = 0.16,
  beta = 0.1,
  duration = 17,
  anchorTop = false,
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
  /**
   * Center the orb on the TOP edge of its section instead of its middle, so it
   * bleeds up into the section above — matches how the section-heading glows
   * sit. Use for orbs that are direct children of a tall section (e.g. the CTA)
   * rather than of a top-anchored heading block.
   */
  anchorTop?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // "hidden" → "grow" (animate in) | "instant" (reduced motion, no animation)
  const [state, setState] = useState<"hidden" | "grow" | "instant">("hidden");
  const coarse = useCoarsePointer();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fxOff("orbs")) {
      el.style.display = "none";
      return;
    }
    const reduce = prefersReducedMotion();
    let growTimer = 0;
    const promote = () => setState(reduce ? "instant" : "grow");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // Mounting mid page-transition? Hold the grow until the wipe settles,
        // exactly like the text reveals (see transition-timing). Growing on
        // intersection immediately fired DURING the wipe on the destination
        // page and desynced with the view-transition snapshot (snapshot caught
        // the orb hidden; the live orb was mid-fade → the glow "popped" the
        // instant the snapshot cleared). Waiting removes the race.
        const delay = getRevealDelay();
        if (delay > 0) growTimer = window.setTimeout(promote, delay * 1000);
        else promote();
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (growTimer) clearTimeout(growTimer);
    };
  }, []);

  const shown = state !== "hidden";
  // Coarse: grow in with opacity only (scaling the layer would re-raster) and
  // hold it static afterward, so a stopped page reaches a quiescent GPU state.
  const hidden = coarse ? "scale(1)" : "scale(0.35)";
  // Smaller footprint on mobile (per design), but the reach that's left has to
  // stay soft.
  const a = alpha * GLOW_BOOST;
  const b = beta * GLOW_BOOST;
  const effSize = coarse ? Math.round(size * 0.72) : size;
  // anchorTop: center on the section's top edge (bleeds up into the section
  // above) instead of the section's middle. Overridable by an explicit
  // style.top from the caller (spread last).
  const top = anchorTop
    ? `${-effSize / 2}px`
    : `calc(50% - ${effSize / 2}px)`;
  // Without a blur filter the gradient's own falloff IS the edge, so a 2-stop
  // gradient shows a visible "end" that reads as a seam between sections. These
  // extra low-alpha stops carry the tail gently all the way to the box edge
  // (transparent at 100%, not 82%) — a hand-rolled gaussian that dissolves
  // instead of stopping, so the glow bleeds across the boundary like the
  // blurred desktop one, at zero filter cost.
  const background = coarse
    ? `radial-gradient(circle,rgba(255,45,120,${a}) 0%,rgba(139,43,232,${b}) 26%,rgba(139,43,232,${(b * 0.5).toFixed(4)}) 48%,rgba(139,43,232,${(b * 0.16).toFixed(4)}) 70%,rgba(10,10,14,0) 100%)`
    : `radial-gradient(circle,rgba(255,45,120,${a}) 0%,rgba(139,43,232,${b}) 45%,rgba(10,10,14,0) 72%)`;

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute ${className ?? ""}`}
      style={{
        width: effSize,
        height: effSize,
        left: `calc(50% - ${effSize / 2}px)`,
        top,
        transform: shown ? "scale(1)" : hidden,
        opacity: shown ? 1 : 0,
        transition:
          state === "instant"
            ? "none"
            : coarse
              ? "opacity 1.1s ease-out"
              : "transform 1.4s cubic-bezier(.2,.7,.2,1), opacity 1.1s ease-out",
        ...style,
      }}
    >
      <div
        className={`h-full w-full rounded-full ${coarse ? "" : "animate-glow-drift"}`}
        style={{
          background,
          filter: coarse ? undefined : `blur(${blur}px)`,
          animationDuration: coarse ? undefined : `${duration}s`,
        }}
      />
    </div>
  );
}
