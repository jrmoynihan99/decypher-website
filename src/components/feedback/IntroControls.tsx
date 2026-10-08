"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";
import { finePointer } from "./survey-fx";

/**
 * The intro's two controls: the name field and the ring that starts the
 * survey — the recap's hold-to-decypher, shortened to a 650ms charge.
 *
 * Unlike the recap's seal, letting go doesn't wind it back: a press starts the
 * charge and it runs to the end, so a tap works as well as a hold ("hold or
 * tap to begin"). The ring stays locked out until there's a name of at least
 * two characters; pressing it then shakes the field and puts the cursor in it.
 */

const HOLD_MS = 650;
const RING_C = 314.16; // 2π × r50

export type NameFieldHandle = { nudge: () => void };

export const NameField = forwardRef<
  NameFieldHandle,
  { value: string; onChange: (v: string) => void; onEnter: () => void }
>(function NameField({ value, onChange, onEnter }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ok = value.trim().length >= 2;

  useImperativeHandle(ref, () => ({
    nudge() {
      const w = wrapRef.current;
      if (w) {
        // restart the shake even if it's mid-run
        w.classList.remove("fb-nudge");
        void w.offsetWidth;
        w.classList.add("fb-nudge");
      }
      inputRef.current?.focus();
    },
  }));

  // With a mouse, an empty name gets the cursor once the intro has settled.
  // Never on touch: focusing would throw the keyboard over the page on load.
  // Judged on the name the screen opened with — typing mustn't re-arm it.
  const openedEmpty = useRef(value.trim().length < 2);
  useEffect(() => {
    if (!openedEmpty.current || !finePointer()) return;
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 650);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={wrapRef} className="fb-enter relative mt-[26px] max-w-[400px]">
      <label htmlFor="fb-name" className="mb-2 block font-mono text-[11px] tracking-[0.14em] text-magenta">
        [ YOUR NAME ]
      </label>
      <input
        ref={inputRef}
        id="fb-name"
        type="text"
        autoComplete="name"
        autoCapitalize="words"
        spellCheck={false}
        maxLength={120}
        placeholder="First and last name"
        aria-describedby="fb-name-hint"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className={`w-full rounded-[14px] border bg-white/[0.035] py-[15px] pl-4 pr-11 font-display text-[1.15rem] font-semibold tracking-[-0.01em] text-fog outline-none transition-[border-color,box-shadow] duration-200 placeholder:font-normal placeholder:text-muted focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,.14),0_0_26px_rgba(255,45,120,.22)] md:backdrop-blur-[6px] ${
          ok ? "border-teal/55" : "border-white/10"
        }`}
      />
      <span
        aria-hidden
        className={`absolute right-3.5 top-[43px] grid h-[22px] w-[22px] place-items-center rounded-full bg-teal text-night transition-[opacity,transform] duration-300 [transition-timing-function:cubic-bezier(.3,1.6,.5,1)] ${
          ok ? "scale-100 opacity-100" : "scale-[.4] opacity-0"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <p id="fb-name-hint" className="mt-2 text-[13px] text-muted">
        So we know who this feedback is from.
      </p>
    </div>
  );
});

export type HoldHandle = { begin: () => void };

export const HoldToBegin = forwardRef<
  HoldHandle,
  {
    /** A name is in: the ring will charge. */
    ready: boolean;
    /** Pressed without a name. */
    onLocked: () => void;
    /** The charge finished and the unlock beat has played. */
    onBegin: () => void;
  }
>(function HoldToBegin({ ready, onLocked, onBegin }, ref) {
  const progRef = useRef<SVGCircleElement>(null);
  const [phase, setPhase] = useState<"idle" | "charging" | "unlocked">("idle");
  const running = useRef(false);
  const raf = useRef(0);
  const timer = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(timer.current);
    },
    [],
  );

  const begin = () => {
    if (running.current || !ready) return;
    running.current = true;
    setPhase("charging");
    const reduce = prefersReducedMotion();
    const finish = () => {
      setPhase("unlocked");
      timer.current = window.setTimeout(onBegin, reduce ? 0 : 320);
    };
    const ring = progRef.current;
    if (reduce || !ring) {
      if (ring) ring.style.strokeDashoffset = "0";
      finish();
      return;
    }
    let p = 0;
    let last = 0;
    const tick = (t: number) => {
      const dt = last ? t - last : 16;
      last = t;
      p = Math.min(1, p + dt / HOLD_MS);
      ring.style.strokeDashoffset = String(RING_C * (1 - p));
      if (p >= 1) return finish();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  // Enter in the name field charges the ring as if it had been pressed.
  useImperativeHandle(ref, () => ({ begin: () => (ready ? begin() : onLocked()) }));

  return (
    <div className="mt-auto flex flex-col items-center pt-8">
      <button
        type="button"
        aria-label="Start the survey"
        aria-disabled={!ready}
        // Down, not up: the charge starts the moment a finger lands. The click
        // that follows is a no-op once it's running; with no name, the click
        // is what nudges (a pointerdown nudge as well would shake it twice).
        onPointerDown={(e) => {
          if (!ready) return;
          if (e.cancelable) e.preventDefault();
          begin();
        }}
        onClick={() => (ready ? begin() : onLocked())}
        className={`relative grid h-[112px] w-[112px] cursor-pointer select-none place-items-center rounded-full border-0 bg-[radial-gradient(circle,rgba(255,45,120,.14),transparent_68%)] p-0 outline-none [-webkit-tap-highlight-color:transparent] [touch-action:none] focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-4 focus-visible:ring-offset-night ${
          ready ? "" : "opacity-45 saturate-[.4]"
        }`}
      >
        <svg viewBox="0 0 112 112" aria-hidden className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="56" cy="56" r="50" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="2" />
          <circle
            ref={progRef}
            cx="56"
            cy="56"
            r="50"
            fill="none"
            stroke="var(--color-magenta)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C}
            style={{ filter: "drop-shadow(0 0 6px var(--color-magenta))" }}
          />
        </svg>
        <span
          aria-hidden
          className={`grid h-[58px] w-[58px] place-items-center rounded-full border transition-[transform,background-color,color,border-color,box-shadow] duration-[250ms] ${
            phase === "unlocked"
              ? "scale-[1.06] border-teal bg-teal text-night shadow-[0_0_40px_rgba(61,214,196,.9)]"
              : `border-magenta text-magenta ${ready ? "shadow-[0_0_34px_rgba(255,45,120,.4)]" : ""} ${
                  phase === "charging" ? "scale-[.92]" : ""
                }`
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </button>
      <p aria-hidden className="mt-3.5 text-center font-mono text-[11px] tracking-[0.14em] text-muted">
        {ready ? "[ HOLD OR TAP TO BEGIN ]" : "[ ADD YOUR NAME TO BEGIN ]"}
      </p>
    </div>
  );
});
