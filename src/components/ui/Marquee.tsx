"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";
import { fxOff } from "@/lib/fx";
import { ensureScrollDrive, scrollVelocity } from "@/lib/scrollDrive";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Horizontal auto-scrolling marquee. Children must be duplicated an even
 * number of times (e.g. `[...row, ...row]`) so the loop wraps seamlessly at
 * half the track width.
 *
 * Desktop: a transform-driven track you can grab, drag, and throw — on
 * release the flick momentum decays back to the passive scroll speed.
 * `curve` bows the strip into an arc (edges lifted, center dipped, items
 * fanned); `scrollDrive` lets page-scroll modulate the pace.
 *
 * Mobile (< md): a NATIVE overflow-x scroller — the OS owns the gesture
 * (drag, momentum, rubber-band). The passive drift is kept by advancing
 * `scrollLeft` while the user is idle, pausing on touch and while momentum
 * runs. Always flat: no curve, no scroll-drive.
 */
export default function Marquee({
  children,
  duration,
  reverse = false,
  className = "",
  curve = 0,
  scrollDrive = false,
}: {
  children: ReactNode;
  /** Seconds for the track to travel one content-set width (matches CSS pace). */
  duration: number;
  reverse?: boolean;
  /** Extra classes for the moving track (gap, padding). */
  className?: string;
  /** Vertical arc amplitude in px; 0 = flat. Edges rise, center dips. Desktop only. */
  curve?: number;
  /** Let window scroll speed up / reverse the marquee. Desktop only. */
  scrollDrive?: boolean;
}) {
  const mobile = useIsMobile();
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  /* ── desktop: transform-driven track with drag/throw ── */
  useEffect(() => {
    if (mobile || fxOff("marquee")) return;
    const track = trackRef.current;
    if (!track) return;
    const reduced = prefersReducedMotion();
    const dir = reverse ? 1 : -1;
    if (scrollDrive) ensureScrollDrive();

    // arc shaping — tuned constants for the fanned-card look
    const ROT = 6; // deg of tilt at the edges
    const EDGE_SCALE = 0.06; // how much edge items shrink for depth

    // scroll-drive mapping: px/s of page scroll → velocity multiplier
    const NORM = 300; // scroll speed that doubles the pace (lower = more sensitive)
    const INFL_MIN = -9; // scroll up hard enough to strongly reverse
    const INFL_MAX = 12;

    const kids = curve ? (Array.from(track.children) as HTMLElement[]) : [];
    let centers: number[] = [];
    let parentW = 1;

    let period = 1;
    const measure = () => {
      period = track.scrollWidth / 2 || 1;
      parentW = track.parentElement?.clientWidth || period;
      if (curve) {
        centers = kids.map((k) => {
          k.style.willChange = "transform";
          return k.offsetLeft + k.offsetWidth / 2;
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    if (track.parentElement) ro.observe(track.parentElement);

    // passive velocity in px/s; keeps the old CSS pace (one set per `duration`)
    const baseV = () => (reduced ? 0 : (dir * period) / duration);

    const TAU = 0.55; // s — glide time for a throw to relax back to passive speed
    const MAX_THROW = 6000; // px/s — cap on a flick
    const PAUSE_MS = 100; // released after this long without moving → no throw

    let offset = 0;
    let velocity = baseV();
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let prevFrame = 0;
    let raf = 0;
    let visible = true; // assume on-screen until the observer reports

    const wrap = (x: number) => {
      let m = x % period;
      if (m > 0) m -= period; // keep within (-period, 0] so both copies align
      return m;
    };
    const draw = () => {
      track.style.transform = `translate3d(${offset}px,0,0)`;
      if (!curve) return;
      const half = parentW / 2 || 1;
      for (let i = 0; i < kids.length; i++) {
        let t = (centers[i] + offset - half) / half; // -1 (left) .. 1 (right)
        if (t < -1) t = -1;
        else if (t > 1) t = 1;
        const tsq = t * t;
        const ty = curve * (0.5 - tsq); // +down at center, -up at edges
        const rot = -ROT * t; // tops lean inward — cards hang along the arc like a banner
        const sc = 1 - EDGE_SCALE * tsq;
        kids[i].style.transform =
          `translateY(${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      }
    };

    const scrollTarget = () => {
      const base = baseV();
      if (!scrollDrive || base === 0) return base;
      let infl = scrollVelocity() / NORM;
      if (infl < INFL_MIN) infl = INFL_MIN;
      else if (infl > INFL_MAX) infl = INFL_MAX;
      return base * (1 + infl);
    };

    const tick = (t: number) => {
      // park while off-screen (drags keep it live — you can't grab what you
      // can't see, but don't fight a pointer that's already captured)
      if (!visible && !dragging) {
        raf = 0;
        return;
      }
      if (!prevFrame) prevFrame = t;
      const dt = Math.min(0.05, (t - prevFrame) / 1000); // clamp tab-switch jumps
      prevFrame = t;
      if (!dragging) {
        offset += velocity * dt;
        const target = scrollTarget();
        velocity = target + (velocity - target) * Math.exp(-dt / TAU);
        // only idle-stop under reduced motion (no passive drift to sustain)
        if (reduced && Math.abs(velocity) < 0.5) {
          velocity = 0;
          offset = wrap(offset);
          draw();
          raf = 0;
          return;
        }
      }
      offset = wrap(offset);
      draw();
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!raf) {
        prevFrame = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const onDown = (e: PointerEvent) => {
      // Leave interactive children alone. Capturing the pointer here retargets
      // the resulting click to the track, so a button inside the strip would
      // never fire — opting out of the drag is what makes it clickable.
      if ((e.target as HTMLElement | null)?.closest?.("[data-nodrag]")) return;
      dragging = true;
      velocity = 0;
      lastX = e.clientX;
      lastT = e.timeStamp;
      track.setPointerCapture(e.pointerId);
      run();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dt = Math.max(8, e.timeStamp - lastT) / 1000;
      offset += dx;
      velocity = velocity * 0.6 + (dx / dt) * 0.4; // smoothed flick velocity
      lastX = e.clientX;
      lastT = e.timeStamp;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      velocity =
        e.timeStamp - lastT > PAUSE_MS
          ? 0
          : Math.max(-MAX_THROW, Math.min(MAX_THROW, velocity));
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}
    };
    const noDrag = (e: Event) => e.preventDefault();

    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    track.addEventListener("dragstart", noDrag);
    // pause the loop while the marquee is off-screen — a homepage carries
    // several of these and they were all animating from load to unmount.
    // rootMargin resumes it just before it scrolls into view, and the dt
    // clamp in tick() already swallows the pause, so nothing jumps.
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting;
        if (visible) run();
      },
      { rootMargin: "160px" },
    );
    io.observe(track.parentElement ?? track);
    run();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      track.removeEventListener("pointerdown", onDown);
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
      track.removeEventListener("dragstart", noDrag);
    };
  }, [duration, reverse, curve, scrollDrive, mobile]);

  /* ── mobile: native scroller + idle drift ── */
  useEffect(() => {
    if (!mobile || fxOff("marquee")) return;
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;
    // no drift under reduced motion — the strip is still natively scrollable
    if (prefersReducedMotion()) return;

    // scrollLeft grows as content moves left (the default direction)
    const dir = reverse ? -1 : 1;

    let period = 1;
    const measure = () => {
      period = track.scrollWidth / 2 || 1;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);

    // The OS owns the gesture. We only drift while the user is idle: any
    // touch pauses it, and any scroll we didn't cause ourselves (finger OR
    // momentum) pushes the resume point out. We tell our own drift apart from
    // a real interaction by comparing the live scroll position against the
    // last value we wrote — a counter of "expected" scroll events can't
    // survive the browser coalescing several programmatic writes into one.
    const IDLE_MS = 180;
    let touching = false;
    let idleAt = 0;
    let pos = -1; // float mirror of scrollLeft (integer writes would stall sub-px drift)
    let lastWritten = -1; // scrollLeft right after our most recent drift write
    let raf = 0;
    let prev = 0;
    let visible = true;

    const onTouchStart = () => {
      touching = true;
      pos = -1;
    };
    const onTouchEnd = () => {
      touching = false;
      idleAt = performance.now();
    };
    const onScroll = () => {
      // our own drift lands within a pixel of lastWritten; a finger or
      // momentum fling moves further — that's a real interaction.
      if (lastWritten >= 0 && Math.abs(scroller.scrollLeft - lastWritten) < 2)
        return;
      pos = -1; // user/momentum moved us — resync when drift resumes
      idleAt = performance.now();
    };

    const tick = (t: number) => {
      if (!visible) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
      // Run every frame at fractional precision: on a high-DPR phone this
      // advances by sub-CSS-pixel device steps, so the strip glides. The old
      // 30fps + Math.round() drift chunked a slow ~1.5px/frame pace into
      // visibly uneven 1–2px jumps — that was the skippiness.
      if (!prev) prev = t;
      const dt = Math.min(0.05, (t - prev) / 1000);
      prev = t;
      if (touching || t - idleAt < IDLE_MS) return;
      if (pos < 0) pos = scroller.scrollLeft;
      pos += ((dir * period) / duration) * dt;
      // seamless wrap — both halves of the track are identical, so jumping
      // by exactly one period is invisible (kept off the hard 0 edge so a
      // reverse row can't pin against the browser's scrollLeft clamp)
      if (pos >= period) pos -= period;
      else if (pos < 1) pos += period;
      scroller.scrollLeft = pos;
      // remember what we asked for — do NOT read scrollLeft back. Reading it
      // right after a write forces a synchronous layout recalc every frame
      // (layout thrash), which is what was still making the strip stutter.
      // The browser lands within a device pixel of pos, well inside the
      // onScroll tolerance below.
      lastWritten = pos;
    };
    const run = () => {
      if (!raf) {
        prev = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    // park while off-screen, same as the desktop loop
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting;
        if (visible) run();
      },
      { rootMargin: "160px" },
    );
    io.observe(scroller);

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    run();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [duration, reverse, mobile]);

  if (mobile) {
    return (
      <div
        ref={scrollerRef}
        className="scrollbar-none overflow-x-auto overscroll-x-contain"
      >
        <div ref={trackRef} className={`flex w-max ${className}`}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className={`flex w-max cursor-grab touch-pan-y select-none active:cursor-grabbing ${className}`}
    >
      {children}
    </div>
  );
}
