/**
 * "Decrypt" text effects shared across the site: text starts as scrambled
 * cipher characters and resolves left-to-right into the real copy.
 */
export const CIPHER_CHARS = "abcdefghjkmnpqrstuvwxyz0123456789#$%&@+=/<>";

export function randChar(): string {
  return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
}

/** Replace every non-whitespace character with a random cipher character. */
export function scramble(str: string): string {
  let out = "";
  for (const c of str) out += /\s/.test(c) ? c : randChar();
  return out;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type DecryptEl = HTMLElement & { _decryptToken?: number };

/**
 * Cipher glyphs are proportional, so scrambled text can be a hair wider than
 * the final copy and wrap to an extra line mid-effect — a layout shift that
 * snaps back when it settles. For any element whose *final* text lays out on a
 * single line, pin `white-space: nowrap` while the effect runs so wider glyphs
 * overflow invisibly instead of wrapping. Genuinely multi-line text is measured
 * and left untouched, so the visual effect is unchanged. Cleared by
 * `unlockLineWidth` when the effect completes or cancels.
 */
function lockLineWidth(el: HTMLElement, target: string): void {
  // measure natural wrapping with no pin in effect
  el.style.whiteSpace = "";
  const probe = " "; // one non-breaking space → exactly one line tall
  el.textContent = probe;
  const singleLineH = el.offsetHeight;
  el.textContent = target;
  const fullH = el.offsetHeight;
  if (singleLineH > 0 && fullH <= singleLineH * 1.5)
    el.style.whiteSpace = "nowrap";
}

function unlockLineWidth(el: HTMLElement): void {
  el.style.whiteSpace = "";
}

/**
 * Reveal pace used when no explicit duration is passed: every character takes
 * the same amount of time, so longer strings animate proportionally longer
 * (constant per-character speed rather than a fixed total).
 */
export const MS_PER_CHAR = 10;
const MIN_DUR = 400;
// cap the total reveal so long strings (e.g. FAQ answers) don't drag on
const MAX_DUR = 1000;

/** Blur applied to encrypted / mid-decrypt text — the "out of focus" look. */
export const REVEAL_BLUR = 5;

/**
 * Put `el` into the encrypted resting state shown before a reveal: scrambled
 * cipher text, blurred. Decrypting (or cancelling) the element clears both.
 */
export function encrypt(el: HTMLElement | null, text: string): void {
  if (!el) return;
  lockLineWidth(el, text);
  el.textContent = scramble(text);
  el.style.filter = `blur(${REVEAL_BLUR}px)`;
}

/**
 * Animate `el`'s textContent from scrambled noise to `target`. Characters
 * lock in left-to-right while the unrevealed tail re-randomizes every ~45ms.
 * Pass `dur` for a fixed total time, or omit it to scale the duration with
 * text length (constant per-character speed). A token guards against
 * overlapping runs on the same element.
 */
export function decryptTo(
  el: HTMLElement | null,
  target: string,
  dur?: number,
  done?: () => void,
): void {
  if (!el) return;
  const node = el as DecryptEl;
  if (prefersReducedMotion()) {
    node.textContent = target;
    done?.();
    return;
  }
  lockLineWidth(node, target);
  const n = target.length;
  const duration = dur ?? Math.min(Math.max(MS_PER_CHAR * n, MIN_DUR), MAX_DUR);
  const scr = Array.from(target, (c) => (/\s/.test(c) ? c : randChar()));
  const t0 = performance.now();
  let last = 0;
  const token = (node._decryptToken = (node._decryptToken || 0) + 1);
  function frame(t: number) {
    if (node._decryptToken !== token) return;
    const p = Math.min(1, (t - t0) / duration);
    const lock = Math.floor(p * n);
    // un-blur alongside the decrypt, pulling into focus by ~60% through the run
    const b = REVEAL_BLUR * Math.max(0, 1 - p / 0.6);
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "";
    if (t - last > 45) {
      last = t;
      for (let i = lock; i < n; i++)
        if (!/\s/.test(target[i])) scr[i] = randChar();
    }
    let out = target.slice(0, lock);
    for (let i = lock; i < n; i++) out += scr[i];
    node.textContent = out;
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      node.textContent = target;
      node.style.filter = "";
      unlockLineWidth(node);
      done?.();
    }
  }
  requestAnimationFrame(frame);
}

/** Cancel an in-flight decrypt animation on `el` (if any). */
export function cancelDecrypt(el: HTMLElement | null): void {
  if (!el) return;
  const node = el as DecryptEl;
  node._decryptToken = (node._decryptToken || 0) + 1;
  node.style.filter = "";
  unlockLineWidth(node);
}

/**
 * Decrypt several elements as ONE continuous reveal: the timeline spans the
 * concatenated text so the lock sweeps through segment 1, then segment 2, and
 * so on. Each element keeps its own color; the blur clears globally. Used for
 * the multi-line hero headline so its lines read as a single effect rather
 * than separate, staggered ones.
 */
export function decryptSegments(
  segments: { el: HTMLElement | null; text: string }[],
  dur?: number,
  done?: () => void,
): void {
  const segs = segments.filter(
    (s): s is { el: HTMLElement; text: string } => !!s.el,
  );
  if (!segs.length) return;
  if (prefersReducedMotion()) {
    for (const s of segs) s.el.textContent = s.text;
    done?.();
    return;
  }
  const nodes = segs.map((s) => s.el as DecryptEl);
  segs.forEach((s) => lockLineWidth(s.el, s.text));
  const tokens = nodes.map(
    (node) => (node._decryptToken = (node._decryptToken || 0) + 1),
  );
  const lens = segs.map((s) => s.text.length);
  const n = lens.reduce((a, b) => a + b, 0);
  const duration = dur ?? Math.min(Math.max(MS_PER_CHAR * n, MIN_DUR), MAX_DUR);
  const scrs = segs.map((s) =>
    Array.from(s.text, (c) => (/\s/.test(c) ? c : randChar())),
  );
  const t0 = performance.now();
  let last = 0;
  function frame(t: number) {
    for (let i = 0; i < nodes.length; i++)
      if (nodes[i]._decryptToken !== tokens[i]) return;
    const p = Math.min(1, (t - t0) / duration);
    const globalLock = Math.floor(p * n);
    const reRand = t - last > 45;
    if (reRand) last = t;
    const bl = REVEAL_BLUR * Math.max(0, 1 - p / 0.6);
    const filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : "";
    let base = 0; // characters consumed by earlier segments
    for (let si = 0; si < segs.length; si++) {
      const { text } = segs[si];
      const len = lens[si];
      const scr = scrs[si];
      const localLock = Math.max(0, Math.min(len, globalLock - base));
      if (reRand)
        for (let i = localLock; i < len; i++)
          if (!/\s/.test(text[i])) scr[i] = randChar();
      let out = text.slice(0, localLock);
      for (let i = localLock; i < len; i++) out += scr[i];
      nodes[si].textContent = out;
      nodes[si].style.filter = filter;
      base += len;
    }
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      for (let si = 0; si < segs.length; si++) {
        nodes[si].textContent = segs[si].text;
        nodes[si].style.filter = "";
        unlockLineWidth(nodes[si]);
      }
      done?.();
    }
  }
  requestAnimationFrame(frame);
}

/* ---- hover scramble: per-character flicker on hover (hero + section titles) ---- */

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** The brand gradient sampled at 0..1 — used to color per-letter spans. */
function gradAt(t: number): string {
  return t < 0.5
    ? lerpColor("#FF5C2E", "#FF2D78", t * 2)
    : lerpColor("#FF2D78", "#8B2BE8", (t - 0.5) * 2);
}

/**
 * Split `el`'s text into per-character spans that briefly scramble (magenta,
 * with a glow) when hovered. Gradient lines get per-letter colors so the
 * gradient survives the split. Call once after the element has decrypted.
 */
export function armHover(el: HTMLElement, gradient = false): void {
  if (prefersReducedMotion()) return;
  const txt = el.textContent ?? "";
  el.textContent = "";
  if (gradient) {
    el.style.background = "none";
    el.style.webkitBackgroundClip = "initial";
    el.style.backgroundClip = "initial";
    el.style.color = "#F1EEF6";
  }
  const chars = Array.from(txt);
  const n = chars.length;
  chars.forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    const cbase = gradient ? gradAt(n <= 1 ? 0 : i / (n - 1)) : "";
    if (cbase) s.style.color = cbase;
    if (!/\s/.test(ch)) {
      let busy = false;
      s.addEventListener("mouseenter", () => {
        if (busy) return;
        busy = true;
        let k = 0;
        s.style.color = "#FF2D78";
        s.style.textShadow = "0 0 20px rgba(255,45,120,.85)";
        const iv = setInterval(() => {
          s.textContent = randChar();
          if (++k > 5) {
            clearInterval(iv);
            s.textContent = ch;
            s.style.color = cbase;
            s.style.textShadow = "none";
            busy = false;
          }
        }, 45);
      });
    }
    el.appendChild(s);
  });
}
