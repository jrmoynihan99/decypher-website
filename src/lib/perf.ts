/**
 * Device-class heuristics for the ambient-effect layers.
 *
 * Phones/tablets (coarse pointers) get a degraded tier: canvas effects render
 * at a lower device-pixel-ratio cap, with fewer particles, and their rAF
 * loops are capped at ~30fps. Two reasons this is the split that matters:
 * mobile GPUs choke on sustained full-screen compositing (thermal throttle →
 * the whole page slows down), and recent iPhones/iPads run rAF at 120Hz, so
 * an unthrottled loop does TWICE the work it does on a 60Hz desktop.
 */
export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * Minimum ms between animation frames on coarse-pointer devices (~30fps).
 * 31ms (not 33) so a 60Hz device lands cleanly on every-other-frame instead
 * of occasionally slipping to every-third.
 */
export const COARSE_FRAME_MS = 31;
