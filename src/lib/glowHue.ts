// Shared scroll-driven hue shift. ScrollHud publishes the current angle; the
// canvas effects rotate their palettes in-draw instead of being run through a
// CSS `filter: hue-rotate()` — filtering a full-section canvas layer re-runs a
// color-matrix over megapixels on every scroll frame, while rotating the small
// set of stroke/fill colors before drawing produces the identical pixels for
// free (the hue matrix is linear, so it commutes with alpha compositing).

let hue = 0;

/** Publish the current hue angle (deg). Reset to 0 on unmount. */
export function setGlowHue(deg: number) {
  hue = deg;
}

export function getGlowHue(): number {
  return hue;
}

// Quantize to 0.5° for the cache key — the old code already stepped at 0.1°
// (`toFixed(1)`), and a 0.5° hue step is far below anything perceptible.
const STEP = 2; // cache keys per degree

const cache = new Map<string, string>();

/**
 * `hex` rotated by the current hue, as a CSS color. Uses the exact
 * feColorMatrix `hueRotate` matrix from the Filter Effects spec (what CSS
 * `hue-rotate()` applies, in sRGB), so canvas output matches the old
 * wrapper-level filter.
 */
export function glowColor(hex: string): string {
  const q = Math.round(hue * STEP) / STEP;
  if (q === 0) return hex;
  const key = `${hex}|${q}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = (q * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)));
  const rr = clamp(
    (0.213 + c * 0.787 - s * 0.213) * r +
      (0.715 - c * 0.715 - s * 0.715) * g +
      (0.072 - c * 0.072 + s * 0.928) * b,
  );
  const gg = clamp(
    (0.213 - c * 0.213 + s * 0.143) * r +
      (0.715 + c * 0.285 + s * 0.14) * g +
      (0.072 - c * 0.072 - s * 0.283) * b,
  );
  const bb = clamp(
    (0.213 - c * 0.213 - s * 0.787) * r +
      (0.715 - c * 0.715 + s * 0.715) * g +
      (0.072 + c * 0.928 + s * 0.072) * b,
  );
  const out = `rgb(${rr},${gg},${bb})`;
  cache.set(key, out);
  return out;
}
