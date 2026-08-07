"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useSpotlight } from "@/hooks/useSpotlight";
import { prefersReducedMotion } from "@/lib/decrypt";
import type { StatContent } from "@/sanity/types";

/**
 * The proof stats and their reveal: values roll up (NumberFlow) as the grid
 * scrolls into view while the redaction bar over each label wipes away.
 *
 * Two chromes, same reveal. `card` is the frosted-glass panel with a
 * cursor-tracking spotlight — the standalone section, where the stats are the
 * subject. `bare` strips the panel down to numeral + label for the schedule
 * hero, where a second frosted block would fight the form sitting next to it;
 * the caller draws the dividers there.
 *
 * Layout is the caller's business — pass the grid classes via `className`.
 *
 * NB: NumberFlow renders its digits in Shadow DOM, so `background-clip: text`
 * gradients can't reach them — but `color` inherits across the shadow boundary,
 * so we tint the numerals a solid brand magenta.
 */

// split a display value like "$4.6M+" into { prefix:"$", num:4.6, suffix:"M+" }
function parseStat(v: string): { prefix: string; num: number; suffix: string } {
  const m = v.match(/^(\D*)([\d.]+)(.*)$/);
  if (!m) return { prefix: "", num: 0, suffix: v };
  return { prefix: m[1], num: parseFloat(m[2]), suffix: m[3] };
}

export default function StatsGrid({
  stats,
  className = "",
  variant = "card",
  highlightIndex = null,
}: {
  stats: StatContent[];
  className?: string;
  variant?: "card" | "bare";
  /**
   * The "selected" card — the one whose figure the revenue graph below is
   * drawing. Reads as an active tab (the other stats get their own graphs
   * eventually); nothing is clickable yet. Card variant only.
   */
  highlightIndex?: number | null;
}) {
  const parsed = useMemo(() => stats.map((s) => parseStat(s.value)), [stats]);
  const gridRef = useRef<HTMLDivElement>(null);
  const wipeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    stats.map(() => false),
  );

  useEffect(() => {
    const grid = gridRef.current;
    const wipes = wipeRefs.current;
    if (!grid) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (prefersReducedMotion()) {
      // defer the state update out of the effect body (no cascading render)
      timers.push(setTimeout(() => setRevealed(stats.map(() => true))));
      wipes.forEach((w) => w && (w.style.transform = "scaleX(0)"));
      return () => timers.forEach(clearTimeout);
    }
    // a display:none grid (the copy hidden at this breakpoint) never
    // intersects, so the off-breakpoint copy stays inert on its own
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.disconnect();
          stats.forEach((_, i) => {
            timers.push(
              setTimeout(() => {
                setRevealed((prev) => {
                  const next = [...prev];
                  next[i] = true;
                  return next;
                });
                const w = wipes[i];
                if (w) w.style.transform = "scaleX(0)";
              }, i * 200),
            );
          });
        }
      },
      { threshold: 0.35 },
    );
    io.observe(grid);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [stats]);

  return (
    <div ref={gridRef} className={className}>
      {stats.map((stat, i) => (
        <StatCard
          key={stat.label}
          stat={stat}
          p={parsed[i]}
          value={revealed[i] ? parsed[i].num : 0}
          variant={variant}
          highlight={variant === "card" && i === highlightIndex}
          registerWipe={(el) => {
            wipeRefs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

/**
 * A single stat. In `card` the cursor spotlight (useSpotlight) trails the
 * pointer and the lift / border / glow ride CSS transitions; `bare` drops all
 * of that chrome and just sets the numeral and its label on the mesh.
 */
function StatCard({
  stat,
  p,
  value,
  variant,
  highlight,
  registerWipe,
}: {
  stat: StatContent;
  p: { prefix: string; num: number; suffix: string };
  value: number;
  variant: "card" | "bare";
  highlight: boolean;
  registerWipe: (el: HTMLSpanElement | null) => void;
}) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLDivElement>();
  const bare = variant === "bare";

  return (
    <div
      ref={bare ? undefined : ref}
      onMouseMove={bare ? undefined : onMouseMove}
      onMouseLeave={bare ? undefined : onMouseLeave}
      className={
        bare
          ? "relative px-5 py-4"
          : // frost is md+ only: the card sits on an always-animating canvas, so
            // a backdrop-filter re-blurs EVERY frame while visible — too hot for
            // mobile GPUs. Phones get a near-opaque panel instead.
            `group relative overflow-hidden rounded-[18px] border bg-panel/85 px-4 py-5 transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)] md:bg-white/[0.045] md:px-7 md:py-8 md:backdrop-blur-xl ${
              highlight
                ? "border-magenta/35 shadow-[0_22px_70px_-30px_rgba(255,45,120,.5)] hover:border-magenta/50"
                : "border-white/10 hover:border-white/20"
            }`
      }
    >
      {/* cursor spotlight — position eased in JS, opacity eased in CSS */}
      {!bare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), rgba(255,45,120,.16), transparent 68%)",
          }}
        />
      )}
      {/* selected-tab dressing: gradient hairline along the bottom edge plus a
          low interior wash — the visual hand-off to the graph drawn beneath */}
      {!bare && highlight && (
        <>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-violet via-magenta to-[#ff5c96]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_115%,rgba(255,45,120,0.13),transparent_62%)]"
          />
        </>
      )}
      <div className="relative">
        <NumberFlow
          value={value}
          prefix={p.prefix}
          suffix={p.suffix}
          format={{ maximumFractionDigits: 1 }}
          // block, or the label — an inline-block sibling — rides up onto the
          // numeral's line whenever it's short enough to fit beside it
          className={
            bare
              ? "text-magenta block font-display text-[clamp(24px,1.9vw,30px)] font-bold leading-none tracking-[-0.02em]"
              : "text-magenta block font-display text-[28px] font-bold leading-none tracking-[-0.02em] md:text-[clamp(40px,4vw,56px)]"
          }
        />
        <div
          className={`relative inline-block ${bare ? "mt-2.5" : "mt-3.5"}`}
        >
          <span
            className={
              bare
                ? "font-mono text-[9.5px] uppercase leading-[1.35] tracking-[0.16em] text-muted"
                : "font-mono text-[10px] uppercase tracking-[0.14em] text-muted md:text-[11.5px] md:tracking-[0.18em]"
            }
          >
            {stat.label}
          </span>
          <span
            ref={registerWipe}
            aria-hidden
            className="absolute -inset-y-[3px] -inset-x-[5px] origin-left rounded bg-edge-mid transition-transform duration-[800ms] ease-[cubic-bezier(.7,0,.3,1)]"
          />
        </div>
      </div>
    </div>
  );
}
