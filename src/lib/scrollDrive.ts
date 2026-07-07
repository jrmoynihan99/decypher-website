// Shared window-scroll velocity tracker. A single passive scroll listener feeds
// every Marquee that opts into scroll-driven speed, so we don't attach one
// listener per carousel. The value is page-scroll velocity in px/s (scrolling
// down is positive) and decays back to 0 shortly after the user stops.

let vel = 0;
let lastY = 0;
let lastT = 0;
let started = false;

const DECAY = 0.16; // seconds — how fast the influence fades once scrolling stops

function now() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function onScroll() {
  const t = now();
  const y = window.scrollY;
  const dt = Math.min(0.1, Math.max(0.008, (t - lastT) / 1000));
  const inst = (y - lastY) / dt; // px/s for this sample
  const decayed = vel * Math.exp(-((t - lastT) / 1000) / DECAY);
  vel = decayed * 0.4 + inst * 0.6; // blend the decayed carry-over with the new sample
  lastY = y;
  lastT = t;
}

/** Attach the shared scroll listener once (idempotent, client-only). */
export function ensureScrollDrive() {
  if (started || typeof window === "undefined") return;
  started = true;
  lastY = window.scrollY;
  lastT = now();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/** Smoothed page-scroll velocity in px/s (down positive), decayed to the moment of the call. */
export function scrollVelocity() {
  if (!started) return 0;
  const dt = (now() - lastT) / 1000;
  return vel * Math.exp(-dt / DECAY);
}
