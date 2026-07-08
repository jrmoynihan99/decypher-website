"use client";

import { useEffect, useState } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

/**
 * Lenis smooth scrolling — engaged ONLY for discrete mouse wheels.
 *
 * Trackpads (and macOS mice, whose deltas the OS accelerates into a
 * trackpad-shaped stream) already scroll smoothly; running Lenis on top of
 * them reads as lag. There is no API that says which device sent a wheel
 * event, so we classify the events themselves and only turn smoothing on
 * once we're confident we're looking at a notched wheel:
 *
 * - `deltaMode` of lines/pages        → real wheel (Firefox default)
 * - any `deltaX`                      → finger input (2D panning)
 * - fractional `deltaY`               → OS-accelerated stream (finger/macOS)
 * - legacy `wheelDeltaY === -3·deltaY`→ Blink/WebKit's synthesized-touch tell
 * - `wheelDeltaY` a multiple of ±120  → classic notch quantization → wheel
 * - big integer steps, no touch tells → wheel
 *
 * Hysteresis is asymmetric on purpose: smoothing engages only after three
 * consecutive wheel votes (a mouse user misses at most the first couple of
 * notches — imperceptible), but a single trackpad vote disengages instantly
 * (never fight finger input, even for one event, e.g. after the user swaps
 * devices). Ambiguous devices (free-spin/hi-res wheels, mice on macOS) never
 * accumulate votes and simply keep native scrolling — every misclassification
 * fails toward native.
 *
 * The provider is always mounted (in `root` mode it drives the real window
 * scroll and adds no wrapper element), so the page tree never remounts — we
 * just toggle `smoothWheel` via options. Touch is never hijacked
 * (`syncTouch: false`); reduced-motion keeps smoothing off entirely. Lenis
 * updates the native scroll position, so framer-motion `useScroll` effects
 * and the view-transition scroll restoration in Providers.tsx keep working
 * unchanged, and `anchors: true` still smooths same-page #hash links.
 */

// Escape hatch: flip to false to force native scrolling everywhere. Lenis
// stays mounted either way (it still handles same-page #hash anchor links,
// which the "See the proof" fix in Providers relies on).
const SMOOTH_ENABLED = true;

function classifyWheel(e: WheelEvent): "wheel" | "trackpad" | null {
  if (e.ctrlKey) return null; // pinch/browser zoom — says nothing about the device
  if (e.deltaMode !== 0) return "wheel"; // line/page deltas only come from real wheels
  if (e.deltaX !== 0) return "trackpad"; // horizontal component = finger panning
  const dy = e.deltaY;
  if (dy === 0) return null;
  if (!Number.isInteger(dy)) return "trackpad"; // accelerated pixel stream
  const wd = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  if (typeof wd === "number" && wd !== 0) {
    if (wd === -3 * dy) return "trackpad"; // synthesized 3× pattern (touch input)
    if (Math.abs(wd) % 120 === 0) return "wheel"; // quantized notches
  }
  // no legacy tell available: large fixed integer steps still read as a wheel
  return Math.abs(dy) >= 40 ? "wheel" : null;
}

export default function SmoothScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  // desktop-shaped environment (viewport + fine pointer, no reduced motion)
  const [desktop, setDesktop] = useState(false);
  // a discrete mouse wheel is what's actually scrolling right now
  const [wheelish, setWheelish] = useState(false);

  useEffect(() => {
    if (!SMOOTH_ENABLED) return;
    const fine = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setDesktop(fine.matches && !reduce.matches);

    update();
    fine.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!SMOOTH_ENABLED) return;
    let votes = 0;
    const onWheel = (e: WheelEvent) => {
      const verdict = classifyWheel(e);
      if (verdict === "trackpad") {
        votes = 0;
        setWheelish(false); // instant retreat — never smooth finger input
      } else if (verdict === "wheel" && ++votes >= 3) {
        setWheelish(true);
      }
    };
    // passive + raw window listener: Lenis consuming the event for scrolling
    // doesn't stop us from reading it for classification
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.15,
        wheelMultiplier: 1,
        smoothWheel: desktop && wheelish,
        syncTouch: false,
        // Same-page hash links (#proof etc.) — CSS scroll-behavior:smooth
        // was removed (it fights Lenis and the view-transition scroll
        // restoration), so Lenis takes over anchor scrolling instead.
        anchors: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
