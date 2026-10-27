"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CountUp from "@/components/ui/CountUp";
import { useSpotlight } from "@/hooks/useSpotlight";
import { prefersReducedMotion } from "@/lib/decrypt";
import type { StatContent } from "@/sanity/types";

/**
 * The proof stats and their reveal: values roll up (CountUp — the same
 * NumberFlow roll as the recap pages) as the grid scrolls into view while the
 * redaction bar over each label wipes away.
 *
 * Two chromes, same reveal. `card` is the frosted-glass panel with a
 * cursor-tracking spotlight — the standalone section, where the stats are the
 * subject. `bare` strips the panel down to numeral + label for the schedule
 * hero and the figures that sit above the proof section's tabs, where a
 * frosted block would read as something to click.
 *
 * `tabs` turns cards into the tabs over the proof section's stage: those
 * cards render as buttons, the active one carries the gradient hairline and
 * the glow, and a click hands its index back. Without it nothing is clickable.
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

export type StatTabs = {
  /** Which indexes are tabs. */
  indexes: number[];
  /** The selected tab's index. */
  active: number | null;
  onSelect: (index: number) => void;
};

export default function StatsGrid({
  stats,
  className = "",
  variant = "card",
  size = "sm",
  tabs = null,
}: {
  stats: StatContent[];
  className?: string;
  variant?: "card" | "bare";
  /** Bare variant only: "lg" sets the numeral at the cards' size — a figure that leads, without a card to click. */
  size?: "sm" | "lg";
  /** Card variant only. */
  tabs?: StatTabs | null;
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
      {stats.map((stat, i) => {
        const tab = variant === "card" && !!tabs && tabs.indexes.includes(i);
        return (
          <StatCard
            key={stat.label}
            stat={stat}
            p={parsed[i]}
            revealed={revealed[i]}
            variant={variant}
            size={size}
            tab={tab}
            active={tab && tabs!.active === i}
            onSelect={tab ? () => tabs!.onSelect(i) : undefined}
            registerWipe={(el) => {
              wipeRefs.current[i] = el;
            }}
          />
        );
      })}
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
  revealed,
  variant,
  size,
  tab,
  active,
  onSelect,
  registerWipe,
}: {
  stat: StatContent;
  p: { prefix: string; num: number; suffix: string };
  revealed: boolean;
  variant: "card" | "bare";
  size: "sm" | "lg";
  tab: boolean;
  active: boolean;
  onSelect?: () => void;
  registerWipe: (el: HTMLSpanElement | null) => void;
}) {
  const { ref, onMouseMove, onMouseLeave } = useSpotlight<HTMLElement>();
  const bare = variant === "bare";
  const lg = bare && size === "lg";
  // one set of props for either element — the spotlight ref as a callback,
  // so a button (a tab) and a div (a plain card) can both take it
  const shared = {
    ref: bare
      ? undefined
      : (el: HTMLElement | null) => {
          ref.current = el;
        },
    onMouseMove: bare ? undefined : onMouseMove,
    onMouseLeave: bare ? undefined : onMouseLeave,
    className:
        bare
          ? lg
            ? "relative px-8 py-2 text-center"
            : "relative px-5 py-4 text-center"
          : // frost is md+ only: the card sits on an always-animating canvas, so
            // a backdrop-filter re-blurs EVERY frame while visible — too hot for
            // mobile GPUs. Phones get a near-opaque panel instead.
            `group relative overflow-hidden rounded-[18px] border bg-panel/85 px-4 py-5 text-left font-[inherit] text-inherit transition-[translate,border-color,box-shadow] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1.5 hover:shadow-[0_26px_80px_-26px_rgba(255,45,120,.55)] md:bg-white/[0.045] md:px-7 md:py-8 md:backdrop-blur-xl ${
              tab ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-magenta" : ""
            } ${
              active
                ? "border-magenta/35 shadow-[0_22px_70px_-30px_rgba(255,45,120,.5)] hover:border-magenta/50"
                : "border-white/10 hover:border-white/20"
            }`,
  };
  const inner = (
    <>
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
          low interior wash — the visual hand-off to the stage drawn beneath */}
      {!bare && active && (
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
      {/* a tab says it's live: the same breathing dot as the stage's readout */}
      {tab && (
        <span
          aria-hidden
          className={`absolute right-3 top-3 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] ${
            active ? "text-mist" : "text-dusk group-hover:text-mist"
          }`}
        >
          <i className={active ? "rvg-live-dot" : "h-[5px] w-[5px] rounded-full bg-teal opacity-60"} />
          live
        </span>
      )}
      <div className="relative">
        <CountUp
          start={revealed}
          value={p.num}
          prefix={p.prefix}
          suffix={p.suffix}
          format={{ maximumFractionDigits: 1 }}
          // block, or the label — an inline-block sibling — rides up onto the
          // numeral's line whenever it's short enough to fit beside it
          className={
            bare && !lg
              ? "text-magenta block font-display text-[clamp(26px,2.2vw,34px)] font-bold leading-none tracking-[-0.02em]"
              : "text-magenta block font-display text-[28px] font-bold leading-none tracking-[-0.02em] md:text-[clamp(40px,4vw,56px)]"
          }
        />
        <div
          className={`relative inline-block ${bare && !lg ? "mt-2.5" : "mt-3.5"}`}
        >
          <span
            className={
              bare && !lg
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
    </>
  );
  return tab ? (
    <button type="button" aria-pressed={active} onClick={onSelect} {...shared}>
      {inner}
    </button>
  ) : (
    <div {...shared}>{inner}</div>
  );
}
