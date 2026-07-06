"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/decrypt";

/**
 * Horizontal auto-scrolling marquee you can grab, drag, and throw. On release
 * the flick momentum decays back to the passive scroll speed. Children must be
 * duplicated an even number of times (e.g. `[...row, ...row]`) so the loop
 * wraps seamlessly at half the track width.
 */
export default function Marquee({
  children,
  duration,
  reverse = false,
  className = "",
}: {
  children: ReactNode;
  /** Seconds for the track to travel one content-set width (matches CSS pace). */
  duration: number;
  reverse?: boolean;
  /** Extra classes for the moving track (gap, padding). */
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduced = prefersReducedMotion();
    const dir = reverse ? 1 : -1;

    let period = track.scrollWidth / 2 || 1;
    const ro = new ResizeObserver(() => {
      period = track.scrollWidth / 2 || 1;
    });
    ro.observe(track);

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
    };

    const tick = (t: number) => {
      if (!prevFrame) prevFrame = t;
      const dt = Math.min(0.05, (t - prevFrame) / 1000); // clamp tab-switch jumps
      prevFrame = t;
      if (!dragging) {
        offset += velocity * dt;
        const target = baseV();
        velocity = target + (velocity - target) * Math.exp(-dt / TAU);
        if (target === 0 && Math.abs(velocity) < 0.5) {
          velocity = 0;
          offset = wrap(offset);
          draw();
          raf = 0; // idle (reduced motion): stop until the next interaction
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
  }, [duration, reverse]);

  return (
    <div
      ref={trackRef}
      className={`flex w-max cursor-grab touch-pan-y select-none active:cursor-grabbing ${className}`}
    >
      {children}
    </div>
  );
}
