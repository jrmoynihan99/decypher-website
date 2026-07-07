"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";
import { ensureScrollDrive, scrollVelocity } from "@/lib/scrollDrive";

/**
 * Horizontal auto-scrolling marquee you can grab, drag, and throw. On release
 * the flick momentum decays back to the passive scroll speed. Children must be
 * duplicated an even number of times (e.g. `[...row, ...row]`) so the loop
 * wraps seamlessly at half the track width.
 *
 * `curve` bows the strip into an arc (edges lifted, center dipped, items fanned).
 * `scrollDrive` lets page-scroll modulate the pace: scroll down speeds it up,
 * scroll up reverses it, and it eases back to the passive speed when you stop.
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
  /** Vertical arc amplitude in px; 0 = flat. Edges rise, center dips. */
  curve?: number;
  /** Let window scroll speed up / reverse the marquee. */
  scrollDrive?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    run();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      track.removeEventListener("pointerdown", onDown);
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
      track.removeEventListener("dragstart", noDrag);
    };
  }, [duration, reverse, curve, scrollDrive]);

  return (
    <div
      ref={trackRef}
      className={`flex w-max cursor-grab touch-pan-y select-none active:cursor-grabbing ${className}`}
    >
      {children}
    </div>
  );
}
