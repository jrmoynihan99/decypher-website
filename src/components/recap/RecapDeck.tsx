"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

/**
 * The recap as a deck: one section per slide, stepped through like a
 * presentation instead of scrolled. Space, Enter and → go forward, ← and
 * Backspace go back, a swipe does the same on a phone, and the arrows in
 * the corner work everywhere. Slides crossfade; each one mounts fresh, so
 * the section's own reveals (the decrypting heading, the rising panels,
 * the counting figures, the glow behind the heading) play as it fades in
 * and leave with it, exactly as they did on the scrolling page.
 *
 * The background layers (the cipher rain, the neural web) are the deck's
 * backdrop, outside the slide stack, so they never remount or restart.
 *
 * Progress: on desktop, a rail down the left lights each section up as it's
 * reached (click one to jump); on a phone, a segmented bar across the top.
 *
 * Nothing is navigable until `unlocked`: the first slide is the seal, and
 * the client opens it before any of this appears.
 *
 * A slide that's taller than the screen (the before/after stages on a
 * laptop) is scaled down to fit, like a slide would be, down to MIN_SCALE;
 * past that it scrolls. Phones always scroll: at that width every section
 * is one long column and shrinking it would make it unreadable.
 */

export type Slide = {
  key: string;
  /** The rail's word for it. */
  label: string;
  /** A DOM id, for the few links that point at a section. */
  id?: string;
  /** Shrink to fit the screen on desktop. Off for the hero, which is full-screen by design. */
  fit?: boolean;
  body: React.ReactNode;
};

const MIN_SCALE = 0.6; // a 1366×768 laptop's window lands near 0.61 on the before/after stages
const RAIL_ITEM = 28; // px per rail row, so the lit line's length is index × this
const BAND = 64; // px along the bottom kept for the footer and the controls

const pad = (n: number) => String(n).padStart(2, "0");

export default function RecapDeck({
  slides,
  unlocked,
  backdrop,
  footer,
  onIndexChange,
}: {
  slides: Slide[];
  /** False while the seal is closed: no controls, no keys, no swipe. */
  unlocked: boolean;
  /** Layers behind every slide; mounted once, never swapped. */
  backdrop?: React.ReactNode;
  /** Bottom left of every slide after the first (the seal's own chip sits there). */
  footer?: React.ReactNode;
  onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  // the first time they move on, the next button stops asking for it
  const [nudged, setNudged] = useState(false);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const n = slides.length;
  const last = n - 1;

  const unlockedRef = useRef(unlocked);
  const onIndexChangeRef = useRef(onIndexChange);
  useEffect(() => {
    unlockedRef.current = unlocked;
    onIndexChangeRef.current = onIndexChange;
  });

  // the index as of the last call, so a burst of key presses steps in order
  // instead of each one stepping from the same rendered value
  const indexRef = useRef(0);
  const go = useCallback(
    (to: number) => {
      if (!unlockedRef.current) return;
      const t = Math.max(0, Math.min(last, to));
      if (t === indexRef.current) return;
      indexRef.current = t;
      setIndex(t);
      setNudged(true);
      onIndexChangeRef.current?.(t);
    },
    [last],
  );
  const prev = useCallback(() => go(indexRef.current - 1), [go]);
  const next = useCallback(() => go(indexRef.current + 1), [go]);

  // keys: never while sealed (space is the hold), never over a form field,
  // and space/enter are left to any focused button or link
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!unlockedRef.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      const onControl = !!t?.closest("button, a, [role=radio], [role=button]");
      switch (e.key) {
        case " ":
        case "Enter":
          if (onControl) return;
          e.preventDefault();
          if (e.shiftKey) prev();
          else next();
          return;
        case "ArrowRight":
          e.preventDefault();
          next();
          return;
        case "ArrowLeft":
        case "Backspace":
          e.preventDefault();
          prev();
          return;
        case "Home":
          e.preventDefault();
          go(0);
          return;
        case "End":
          e.preventDefault();
          go(last);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prev, next, last]);

  // the lock button keeps focus after the seal opens; let space mean "next" from here
  useEffect(() => {
    if (unlocked) (document.activeElement as HTMLElement | null)?.blur?.();
  }, [unlocked]);

  // a horizontal swipe on a phone; vertical pans scroll the slide (touch-action: pan-y)
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) next();
    else prev();
  };

  const slide = slides[index] ?? slides[0];
  const fade = reduced ? 0 : 1;

  return (
    <div className="relative z-[1] h-svh overflow-hidden">
      {backdrop}

      {/* ── the slides, stacked; the leaving one fades under the arriving one ── */}
      <div
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={slide.key}
            id={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${n}: ${slide.label}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.6 * fade, ease: [0.2, 0.7, 0.2, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.4 * fade, ease: "easeOut" } }}
            onUpdate={noop}
            className="absolute inset-0"
          >
            <FitSlide fit={!!slide.fit}>{slide.body}</FitSlide>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── progress: the rail (desktop) ── */}
      <nav
        aria-label="Sections"
        className={`absolute left-5 top-1/2 z-[6] hidden -translate-y-1/2 transition-opacity duration-700 md:block print:hidden ${
          unlocked ? "" : "pointer-events-none opacity-0"
        }`}
      >
        <ol className="relative m-0 list-none p-0">
          <span aria-hidden className="absolute left-[5px] w-px bg-white/10" style={{ top: RAIL_ITEM / 2, bottom: RAIL_ITEM / 2 }} />
          <span
            aria-hidden
            className="absolute left-[5px] w-px bg-teal transition-[height] duration-500 ease-out"
            style={{ top: RAIL_ITEM / 2, height: index * RAIL_ITEM }}
          />
          {slides.map((s, i) => {
            const state = i < index ? "done" : i === index ? "now" : "todo";
            return (
              <li key={s.key} style={{ height: RAIL_ITEM }}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={state === "now" ? "step" : undefined}
                  className="group flex h-full cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left"
                >
                  <span
                    className={`relative h-[11px] w-[11px] flex-none rounded-full border transition-[background-color,border-color,box-shadow] duration-500 ${
                      state === "done"
                        ? "border-teal bg-teal"
                        : state === "now"
                          ? "border-magenta bg-magenta shadow-[0_0_14px_rgba(255,45,120,.85)]"
                          : "border-white/20 bg-night group-hover:border-white/50"
                    }`}
                  >
                    {state === "now" ? <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full" /> : null}
                  </span>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-500 group-hover:text-fog ${
                      state === "now" ? "text-fog" : state === "done" ? "text-mist" : "text-faint"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── progress: the segments (phones) ── */}
      <div
        role="progressbar"
        aria-label="Sections"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={index + 1}
        className={`absolute inset-x-4 top-[max(10px,env(safe-area-inset-top))] z-[6] flex gap-1 transition-opacity duration-700 md:hidden print:hidden ${
          unlocked ? "" : "pointer-events-none opacity-0"
        }`}
      >
        {slides.map((s, i) => (
          <span
            key={s.key}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-500 ${
              i < index ? "bg-teal" : i === index ? "bg-magenta shadow-[0_0_8px_rgba(255,45,120,.8)]" : "bg-white/15"
            }`}
          />
        ))}
      </div>

      {/* ── the slide footer, bottom left ── */}
      {footer ? (
        <div
          className={`absolute bottom-[max(18px,env(safe-area-inset-bottom))] left-[18px] z-[6] transition-opacity duration-500 print:hidden ${
            unlocked && index > 0 ? "" : "pointer-events-none opacity-0"
          }`}
        >
          {footer}
        </div>
      ) : null}

      {/* ── the controls, bottom right ── */}
      <div
        className={`absolute bottom-[max(18px,env(safe-area-inset-bottom))] right-[18px] z-[6] flex items-center gap-4 transition-opacity duration-700 print:hidden ${
          unlocked ? "" : "pointer-events-none opacity-0"
        }`}
      >
        {/* the hint, from the second slide on: the title slide carries its own under the numbers */}
        {!coarse && index > 0 && index < last ? (
          <div aria-hidden className="hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-dusk md:flex">
            press <Keycap>space</Keycap>
          </div>
        ) : null}
        <div className="flex items-center gap-1 rounded-full border border-edge-mid bg-night/90 p-1 md:bg-night/80 md:backdrop-blur-[8px]">
          <span className="px-3 font-mono text-[11px] tabular-nums tracking-[0.14em] text-dusk">
            {pad(index + 1)} <span className="text-faint">/</span> {pad(n)}
          </span>
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/10 bg-transparent text-mist transition-colors hover:border-mist hover:text-fog disabled:cursor-default disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-mist"
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={index === last}
            aria-label="Next"
            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full border-0 bg-magenta text-white shadow-[0_0_24px_rgba(255,45,120,.55)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-default disabled:opacity-30 disabled:shadow-none ${
              !nudged && index < last ? "animate-pulse-ring" : ""
            }`}
          >
            <Chevron dir="right" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One slide's content, centred on the screen and scaled down to fit it on
 * desktop (see MIN_SCALE). The scaled wrapper is given its visual height so
 * nothing scrolls while it fits; past the floor, or on a phone, it's the
 * natural layout and the slide scrolls.
 */
function FitSlide({ fit, children }: { fit: boolean; children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const enabled = fit && !mobile;
  const [measured, setScale] = useState<{ s: number; natural: number } | null>(null);
  const scale = enabled ? measured : null;

  useLayoutEffect(() => {
    if (!enabled) return;
    const sc = scroller.current;
    const el = inner.current;
    if (!sc || !el) return;
    // measured at mount and when the viewport changes, not on every reflow
    // inside: a heading mid-decrypt can wrap differently for a frame, and
    // rescaling to that would make the whole slide twitch
    const measure = () => {
      const avail = sc.clientHeight - BAND;
      const natural = el.offsetHeight;
      if (!avail || !natural) return;
      const s = Math.min(1, avail / natural);
      setScale(s < 1 && s >= MIN_SCALE ? { s, natural } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [enabled]);

  return (
    <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden [touch-action:pan-y]">
      {/* the band under a fitted slide keeps it off the footer and controls; the hero is full-screen by design */}
      <div className="flex min-h-full flex-col" style={fit ? { paddingBottom: BAND } : undefined}>
        <div className="my-auto w-full" style={scale ? { height: scale.natural * scale.s } : undefined}>
          <div
            ref={inner}
            className="w-full"
            style={scale ? { transform: `scale(${scale.s})`, transformOrigin: "top center" } : undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A key, pressing itself every couple of seconds. */
export function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex animate-key-press items-center rounded-[7px] border border-white/25 bg-white/[0.07] px-2.5 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-fog">
      {children}
    </kbd>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "right" ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
    </svg>
  );
}
