"use client";

import { useEffect, useRef, useState } from "react";
import { createRevealSound, type RevealSound } from "@/components/recap/reveal-sound";
import GlowOrb from "@/components/ui/GlowOrb";
import { prefersReducedMotion, randChar, scrambleCells } from "@/lib/decrypt";
import { COARSE_FRAME_MS, isCoarsePointer } from "@/lib/perf";
import { money } from "@/lib/widget-format";

/**
 * The top of a client's recap, sealed. It opens to a scrambled headline and a
 * lock; the client presses and holds to decypher it. Holding fills the ring,
 * decrypts the headline in step ("Maya, you saved $31,045") and drags every
 * cipher glyph on screen into the hand; letting go early winds all of it
 * back. At 100% the lock opens, the glyphs implode and burst, and then the
 * lock gives way to the headline numbers (`children`, from RecapView) and a
 * scroll cue — the decyphered header stays as the page's hero and the rest of
 * the recap continues below it. `onOpen` is when to mount that rest.
 *
 * Nothing is remembered: every fresh load is sealed again, which is the
 * point of it. `initiallyOpen` renders the finished state with no gesture
 * (the page's `?open`, for staff previews and printing).
 *
 * One progress value per frame drives three things: the ring + headline
 * (scrambleCells, from lib/decrypt), the noise field (a canvas of drifting
 * glyphs with gravity at the hold point) and the pull on the lock (its glow,
 * its compression, the shudder near the end). The cipher rain and the neural
 * mesh behind it belong to RecapView, so the background is continuous down
 * the page — and the mesh's own click-and-hold pull joins in for free.
 *
 * It has a sound (reveal-sound.ts), on by default where there's a mouse and
 * off on touch devices — a phone is more often somewhere quiet, and iOS's
 * silent switch mutes it anyway. The speaker toggle remembers a choice.
 */

const HOLD_MS = 1800; // a full hold
const DECAY_MS = 800; // how fast it winds back when let go
const RING_C = 2 * Math.PI * 54;
const PALETTE = ["255,45,120", "139,43,232", "255,92,46"];
const SOUND_KEY = "dcy-recap-sound";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The remembered toggle, or null for the device default. */
function readSoundPref(): boolean | null {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

export default function RecapHero({
  firstName,
  taxYear,
  savings,
  initiallyOpen = false,
  onOpen,
  children,
}: {
  firstName: string;
  taxYear: number;
  savings: number;
  initiallyOpen?: boolean;
  /** Fires as the lock gives way — the moment to mount the rest of the recap. */
  onOpen: () => void;
  /** The headline numbers that take the lock's place once it's open. */
  children?: React.ReactNode;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const progRef = useRef<SVGCircleElement>(null);
  const coreRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  // latest onOpen without it being a dependency of the effect below — the
  // parent passes a fresh closure every render, and re-running the effect
  // would re-seal the hero mid-hold
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(initiallyOpen);
  const [open, setOpen] = useState(initiallyOpen);
  // null until the device default / remembered choice is read on the client
  const [sound, setSound] = useState<boolean | null>(null);
  const soundRef = useRef<RevealSound | null>(null);

  const line1 = `${firstName}, you saved`;
  const line2 = money(savings);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    const s = soundRef.current;
    if (s) {
      // the click is a gesture, so the context can be created here too
      s.setEnabled(next);
      if (next) s.blip();
    }
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* private mode — the choice just won't persist */
    }
  };

  useEffect(() => {
    if (initiallyOpen) return;
    const stage = stageRef.current;
    const col = colRef.current;
    const l1 = line1Ref.current;
    const l2 = line2Ref.current;
    const btn = btnRef.current;
    const prog = progRef.current;
    const core = coreRef.current;
    const canvas = canvasRef.current;
    const chip = chipRef.current;
    if (!stage || !col || !l1 || !l2 || !btn || !prog || !core || !canvas || !chip) return;
    const reduce = prefersReducedMotion();
    const coarse = isCoarsePointer();

    // The headline: scrambled now, decrypted by the hold. scrambleCells paints
    // the scrambled state synchronously, so the pre-hydration blur class can
    // come off in the same task without the finished copy ever showing.
    const s1 = scrambleCells(l1, line1);
    const s2 = scrambleCells(l2, line2);
    l1.classList.remove("decrypt-pending");
    l2.classList.remove("decrypt-pending");
    const n1 = line1.length;
    const n2 = line2.length;
    const total = n1 + n2;

    // canvas fonts can't resolve var(--font-mono); the chip is set in it, so
    // borrow the family the browser actually picked
    const field = reduce
      ? null
      : noiseField(stage, canvas, { flash: flashRef.current, wave: waveRef.current }, getComputedStyle(chip).fontFamily, coarse);

    let isHeld = false;
    let isDone = false;
    let p = 0;
    let last = 0;
    let lastPct = -1;
    let raf = 0;
    const timers: number[] = [];

    // sound: on by default with a mouse, off on touch, unless they've chosen.
    // The state update is deferred out of the effect body (see StatsGrid).
    const soundOn = readSoundPref() ?? !coarse;
    const sound = createRevealSound(soundOn);
    soundRef.current = sound;
    timers.push(window.setTimeout(() => setSound(soundOn)));
    // where the pull is centred: the pointer while it's down, the lock for a keyboard hold
    const pt = { x: stage.clientWidth / 2, y: stage.clientHeight * 0.6 };
    const setPt = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      pt.x = e.clientX - r.left;
      pt.y = e.clientY - r.top;
    };
    const lockPt = () => {
      const r = btn.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      pt.x = r.left - s.left + r.width / 2;
      pt.y = r.top - s.top + r.height / 2;
    };

    const chipText = (q: number) => {
      const pct = Math.round(q * 100);
      if (pct === lastPct) return;
      lastPct = pct;
      chip.textContent = q >= 1 ? "ACCESS GRANTED — 100%" : `DECRYPTING… ${String(pct).padStart(2, "0")}%`;
      chip.style.color = q >= 1 ? "#3DD6C4" : "";
    };
    // the lock absorbing the pull: hotter glow, compressing, and the page shudders past 60%
    const pull = (q: number) => {
      if (!q) {
        core.style.boxShadow = "";
        core.style.transform = "";
        col.style.translate = "";
        return;
      }
      core.style.boxShadow = `0 0 ${(16 + 90 * q).toFixed(0)}px rgba(255,45,120,${(0.15 + 0.7 * q).toFixed(2)})`;
      core.style.transform = `scale(${(1 - 0.12 * q).toFixed(3)})`;
      const j = q > 0.6 ? (q - 0.6) * 6 : 0;
      col.style.translate = j ? `${((Math.random() - 0.5) * j).toFixed(1)}px ${((Math.random() - 0.5) * j).toFixed(1)}px` : "";
    };

    const complete = () => {
      if (isDone) return;
      isDone = true;
      isHeld = false;
      s1.finish();
      s2.finish();
      prog.style.strokeDashoffset = "0";
      pull(0);
      chipText(1);
      setHeld(false);
      setDone(true);
      // the whole latch → swell → burst phrase is scheduled on the audio clock here
      sound.unlock(!!field);
      field?.implode();
      timers.push(window.setTimeout(() => field?.burst(pt), 170));
      // the lock gives way to the numbers, and the rest of the recap mounts below
      timers.push(
        window.setTimeout(
          () => {
            setOpen(true);
            onOpenRef.current();
          },
          reduce ? 150 : 1200,
        ),
      );
    };

    const down = (e: PointerEvent | null) => {
      if (isDone) return;
      // the speaker toggle is a control, not part of the hold
      if (e && (e.target as Element).closest("[data-sound-toggle]")) return;
      if (e) setPt(e);
      else lockPt();
      // this is the gesture the browser needs before it will make a sound
      sound.prime();
      // no motion to hold for: a press opens it
      if (reduce) {
        complete();
        return;
      }
      isHeld = true;
      setHeld(true);
    };
    const move = (e: PointerEvent) => {
      if (isHeld && !isDone) setPt(e);
    };
    const up = () => {
      if (!isHeld) return;
      isHeld = false;
      setHeld(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (!isHeld) down(null);
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    btn.addEventListener("keydown", onKeyDown);
    btn.addEventListener("keyup", up);

    // ~30fps on phones, like the other canvas layers (see lib/perf)
    const minFrame = coarse ? COARSE_FRAME_MS : 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < minFrame) return;
      const dt = last ? Math.min(50, t - last) : 16;
      last = t;
      if (!isDone) {
        p = clamp(p + (isHeld ? dt / HOLD_MS : -dt / DECAY_MS), 0, 1);
        prog.style.strokeDashoffset = String(RING_C * (1 - p));
        // one sweep across both lines, like the hero's decryptSegments
        const g = p * total;
        s1.set(clamp(g / n1, 0, 1), t);
        s2.set(clamp((g - n1) / n2, 0, 1), t);
        pull(p);
        chipText(p);
        sound.progress(p);
      }
      field?.frame(p, dt, isHeld, pt, isDone);
      if (!isDone && p >= 1) complete();
    };
    if (!reduce) raf = requestAnimationFrame(loop);
    else chipText(0);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      field?.destroy();
      sound.destroy();
      soundRef.current = null;
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      btn.removeEventListener("keydown", onKeyDown);
      btn.removeEventListener("keyup", up);
    };
  }, [line1, line2, initiallyOpen]);

  return (
    <section
      ref={stageRef}
      className={`relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-24 text-center ${
        open ? "" : "touch-none select-none"
      }`}
    >
      <GlowOrb size={860} blur={52} alpha={0.22} beta={0.13} duration={15} />

      {/* whose page this is, even while it's sealed */}
      <div className="absolute inset-x-5 top-6 z-[2] flex items-center justify-between gap-4 sm:inset-x-8 sm:top-7">
        <div className="font-display text-[17px] font-semibold text-fog">
          DeCypher <span className="text-grad">Financials</span>
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-[2px] text-muted">Tax Recap · {taxYear}</div>
      </div>

      <div ref={colRef} className="relative z-[2] w-full max-w-[920px]">
        <p className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.3em] text-magenta">
          {done ? `[ ${taxYear} tax recap · decyphered ]` : `[ encrypted · ${taxYear} tax recap ]`}
        </p>
        <h1 className="mt-5 font-display text-[clamp(38px,6.6vw,84px)] font-bold leading-[1.04] tracking-[-0.03em] [text-wrap:balance]">
          <span ref={line1Ref} className={`block text-fog ${initiallyOpen ? "" : "decrypt-pending"}`}>
            {line1}
          </span>
          <span ref={line2Ref} className={`block text-teal ${initiallyOpen ? "" : "decrypt-pending"}`}>
            {line2}
          </span>
        </h1>
        {/* the subline crossfades from the seal's instruction to the recap's own intro */}
        <div className="mx-auto mt-5 grid max-w-[56ch] text-[clamp(15px,1.6vw,18px)] leading-relaxed text-mist">
          <p
            aria-hidden={open}
            className={`m-0 [grid-area:1/1] transition-opacity duration-500 ${open ? "opacity-0" : ""}`}
          >
            Sealed for {firstName} by DeCypher. Press and hold to decypher it.
          </p>
          <p
            aria-hidden={!open}
            className={`m-0 [grid-area:1/1] transition-opacity delay-200 duration-500 ${open ? "" : "opacity-0"}`}
          >
            Where your taxes landed before DeCypher, where they landed after, and what comes next.
          </p>
        </div>

        {/* the lock and the numbers share one slot: the lock fades out as the numbers expand into it */}
        <div className="mt-9 grid">
          <div
            aria-hidden={open}
            className={`flex flex-col items-center [grid-area:1/1] transition-[opacity,transform] duration-500 ${
              open ? "pointer-events-none scale-75 opacity-0" : ""
            }`}
          >
            <button
              ref={btnRef}
              type="button"
              aria-label="Hold to decypher"
              tabIndex={open ? -1 : 0}
              className="relative h-[116px] w-[116px] cursor-pointer rounded-full border-0 bg-transparent p-0 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-magenta focus-visible:ring-offset-4 focus-visible:ring-offset-night"
            >
              <svg viewBox="0 0 120 120" aria-hidden className="absolute inset-0 h-full w-full -rotate-90">
                <defs>
                  <linearGradient id="recap-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ff5c2e" />
                    <stop offset=".5" stopColor="#ff2d78" />
                    <stop offset="1" stopColor="#8b2be8" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="3" />
                <circle
                  ref={progRef}
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="url(#recap-ring)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={done ? 0 : RING_C}
                  style={{ filter: "drop-shadow(0 0 6px rgba(255,45,120,.75))" }}
                />
              </svg>
              <span
                ref={coreRef}
                aria-hidden
                className={`absolute inset-[11px] grid place-items-center rounded-full border transition-[background-color,border-color] duration-300 ${
                  done
                    ? "border-teal bg-teal/[0.12] text-teal shadow-[0_0_40px_rgba(61,214,196,.35)]"
                    : held
                      ? "border-magenta bg-magenta/[0.12] text-fog"
                      : "border-white/10 bg-[rgba(20,19,25,.92)] text-fog"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[26px] w-[26px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  {/* shackle drops open once it's done */}
                  <path d={done ? "M8 11V7a4 4 0 0 1 8 0" : "M8 11V7a4 4 0 0 1 8 0v4"} />
                </svg>
              </span>
              {done && !initiallyOpen ? (
                <>
                  <span aria-hidden className="absolute inset-0 animate-shock rounded-full border-2 border-magenta" />
                  <span aria-hidden className="absolute inset-0 animate-shock rounded-full border-2 border-teal [animation-delay:120ms]" />
                </>
              ) : null}
            </button>
            <p
              className={`mt-[18px] font-mono text-[11px] uppercase tracking-[0.22em] text-dusk transition-opacity duration-300 ${
                done ? "opacity-0" : held ? "" : "animate-pulse-soft"
              }`}
            >
              hold to decypher
            </p>
          </div>

          <div
            className={`grid [grid-area:1/1] transition-[grid-template-rows] duration-[850ms] ease-[cubic-bezier(.2,.7,.2,1)] ${
              open ? "[grid-template-rows:1fr]" : "[grid-template-rows:0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              {open ? (
                <div className={initiallyOpen ? "" : "animate-rise [animation-delay:180ms]"}>
                  {children}
                  <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                    Scroll for the full recap <span className="animate-blink">▼</span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* the noise field over everything, and the burst at the hold point */}
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-[3] h-full w-full print:hidden" />
      <div
        ref={flashRef}
        aria-hidden
        className="pointer-events-none absolute z-[4] h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#fff_0%,rgba(255,45,120,.7)_35%,rgba(139,43,232,0)_70%)] opacity-0"
      />
      <div
        ref={waveRef}
        aria-hidden
        className="pointer-events-none absolute z-[4] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 opacity-0 shadow-[0_0_30px_rgba(255,45,120,.8)]"
      />

      {/* the site's decrypting chip (see ScrollHud) — desktop only, as there */}
      <div className="absolute bottom-[18px] left-[18px] z-[5] hidden items-center gap-2 rounded-lg border border-edge-mid bg-night/80 px-3 py-2 backdrop-blur-[8px] print:hidden md:flex">
        <span
          ref={chipRef}
          className="font-mono text-[11px] tracking-[0.14em] text-[#9A93AB]"
          style={initiallyOpen ? { color: "#3DD6C4" } : undefined}
        >
          {initiallyOpen ? "ACCESS GRANTED — 100%" : "DECRYPTING… 00%"}
        </span>
        <span className="animate-blink font-mono text-[11px] text-magenta [animation-duration:1.1s]">▮</span>
      </div>

      {/* the sound toggle — the one control that isn't part of the hold */}
      {!initiallyOpen ? (
        <button
          type="button"
          data-sound-toggle
          onClick={toggleSound}
          aria-pressed={sound === true}
          aria-label={sound ? "Turn sound off" : "Turn sound on"}
          className={`absolute bottom-[18px] right-[18px] z-[5] flex cursor-pointer items-center gap-2 rounded-lg border border-edge-mid bg-night/80 px-3 py-2 font-mono text-[11px] tracking-[0.14em] backdrop-blur-[8px] transition-[opacity,color] duration-300 hover:text-fog print:hidden ${
            sound === null ? "opacity-0" : sound ? "text-[#9A93AB]" : "text-dusk"
          }`}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {sound ? (
              <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </>
            ) : (
              <path d="m16 9 5 6m0-6-5 6" />
            )}
          </svg>
          {sound ? "SOUND ON" : "SOUND OFF"}
        </button>
      ) : null}
    </section>
  );
}

/* ───────────────────────────── the noise field ───────────────────────────── */

interface Glyph {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  size: number;
  col: string;
  alive: boolean;
  life: number;
}

/**
 * Drifting cipher glyphs over the seal. While held they spiral into the hold
 * point (brightening and shrinking on the way in) and are consumed there; let
 * go and they drift back in from the edges. `implode` clears the field for
 * the beat before `burst` fires every glyph back out from the same point, with
 * the flash and the shockwave.
 */
function noiseField(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  fx: { flash: HTMLElement | null; wave: HTMLElement | null },
  font: string,
  coarse: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // phones: fewer glyphs and a lower backing-store cap, as with the other canvases
  const count = coarse ? 240 : 600;
  const dprCap = coarse ? 1.5 : 2;
  let w = 0;
  let h = 0;
  const resize = () => {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    w = stage.clientWidth;
    h = stage.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const spawn = (edge: boolean): Glyph => {
    let x = Math.random() * w;
    let y = Math.random() * h;
    if (edge) {
      const side = (Math.random() * 4) | 0;
      if (side === 0) x = -12;
      else if (side === 1) x = w + 12;
      else if (side === 2) y = -12;
      else y = h + 12;
    }
    return {
      x,
      y,
      vx: (Math.random() - 0.5) * 24,
      vy: (Math.random() - 0.5) * 24,
      ch: randChar(),
      size: 11 + Math.random() * 4,
      col: PALETTE[Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : 2],
      alive: true,
      life: 0,
    };
  };
  const glyphs: Glyph[] = Array.from({ length: count }, () => spawn(false));
  let mode: "noise" | "implode" | "burst" | "quiet" = "noise";
  let burstT = 0;

  return {
    frame(p: number, dt: number, held: boolean, pt: { x: number; y: number }, done: boolean) {
      const dts = dt / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (mode === "burst") {
        burstT += dts;
        for (const q of glyphs) {
          if (!q.alive) continue;
          q.x += q.vx * dts;
          q.y += q.vy * dts;
          const k = Math.pow(0.3, dts);
          q.vx *= k;
          q.vy *= k;
          q.life -= dts;
          if (q.life <= 0) {
            q.alive = false;
            continue;
          }
          ctx.globalAlpha = clamp(q.life / 1.1, 0, 1);
          ctx.fillStyle = `rgb(${q.col})`;
          ctx.font = `${q.size | 0}px ${font}`;
          ctx.fillText(q.ch, q.x, q.y);
        }
        ctx.globalAlpha = 1;
        if (burstT > 1.8) mode = "quiet";
        return;
      }
      if (mode !== "noise") return;

      // gravity ramps with the hold; nothing respawns once it's done
      const G = held ? 700 + 3200 * p : 0;
      let respawn = held || done ? 0 : 4;
      for (const q of glyphs) {
        if (!q.alive) {
          if (respawn > 0 && Math.random() < 0.5) {
            Object.assign(q, spawn(true));
            respawn--;
          }
          continue;
        }
        let d = 1e9;
        if (held) {
          const dx = pt.x - q.x;
          const dy = pt.y - q.y;
          d = Math.hypot(dx, dy) || 1;
          const ux = dx / d;
          const uy = dy / d;
          // inward pull plus a tangential kick, so they spiral rather than beeline
          q.vx += (ux * G - uy * G * 0.55) * dts;
          q.vy += (uy * G + ux * G * 0.55) * dts;
          const sp = Math.hypot(q.vx, q.vy);
          if (sp > 1800) {
            q.vx *= 1800 / sp;
            q.vy *= 1800 / sp;
          }
          if (d < 16) {
            q.alive = false;
            continue;
          }
        } else {
          const k = Math.pow(0.15, dts);
          q.vx *= k;
          q.vy *= k;
          if (Math.hypot(q.vx, q.vy) < 8) {
            q.vx += (Math.random() - 0.5) * 6;
            q.vy += (Math.random() - 0.5) * 6;
          }
        }
        q.x += q.vx * dts;
        q.y += q.vy * dts;
        if (!held) {
          if (q.x < -20) q.x = w + 20;
          else if (q.x > w + 20) q.x = -20;
          if (q.y < -20) q.y = h + 20;
          else if (q.y > h + 20) q.y = -20;
        }
        if (Math.random() < 0.02) q.ch = randChar();
        let alpha = 0.32;
        let size = q.size;
        if (held) {
          alpha = 0.32 + 0.68 * clamp(1 - d / 420, 0, 1);
          if (d < 90) size = q.size * (0.45 + (0.55 * d) / 90);
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${q.col})`;
        ctx.font = `${size | 0}px ${font}`;
        ctx.fillText(q.ch, q.x, q.y);
      }
      ctx.globalAlpha = 1;
    },
    implode() {
      for (const q of glyphs) q.alive = false;
      mode = "implode";
    },
    burst(pt: { x: number; y: number }) {
      mode = "burst";
      burstT = 0;
      for (const q of glyphs) {
        const a = Math.random() * Math.PI * 2;
        const sp = 300 + Math.random() * 1300;
        Object.assign(q, { x: pt.x, y: pt.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, alive: true, life: 0.6 + Math.random() * 0.7, ch: randChar() });
      }
      for (const [el, cls] of [
        [fx.flash, "animate-flash"],
        [fx.wave, "animate-shockwave"],
      ] as const) {
        if (!el) continue;
        el.style.left = `${pt.x}px`;
        el.style.top = `${pt.y}px`;
        el.classList.add(cls);
      }
    },
    destroy() {
      ro.disconnect();
    },
  };
}
