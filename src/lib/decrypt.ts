/**
 * "Decrypt" text effects shared across the site: text starts as scrambled
 * cipher characters and resolves left-to-right into the real copy.
 */
import { fxOff } from "./fx";

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
 * and left untouched, so the visual effect is unchanged. Centered (or
 * right-aligned) single-line text additionally has its width pinned to the
 * final copy and is left-anchored for the run, so revealed characters don't
 * dance horizontally as the scrambled width fluctuates. Cleared by
 * `unlockLineWidth` when the effect completes or cancels.
 */
function lockLineWidth(el: HTMLElement, target: string): void {
  // clear any pins from a prior run so we measure the element's natural layout
  el.style.whiteSpace = "";
  el.style.width = "";
  el.style.marginInline = "";
  el.style.textAlign = "";
  const probe = " "; // one non-breaking space → exactly one line tall
  el.textContent = probe;
  const singleLineH = el.offsetHeight;
  el.textContent = target;
  const fullH = el.offsetHeight;
  if (singleLineH > 0 && fullH <= singleLineH * 1.5) {
    el.style.whiteSpace = "nowrap";
    // Center-/right-aligned text shifts horizontally as proportional cipher
    // glyphs change width mid-decrypt. Pin the box to the final text width and
    // left-anchor it (kept centered with auto margins) so already-revealed
    // characters hold still; only the unrevealed tail can spill sideways.
    const align = getComputedStyle(el).textAlign;
    if (align === "center" || align === "right" || align === "end") {
      el.style.width = "max-content";
      el.style.width = `${el.offsetWidth}px`;
      el.style.marginInline = "auto";
      el.style.textAlign = "left";
    }
  }
}

function unlockLineWidth(el: HTMLElement): void {
  el.style.whiteSpace = "";
  el.style.width = "";
  el.style.marginInline = "";
  el.style.textAlign = "";
}

/**
 * Reveal pace used when no explicit duration is passed: every character takes
 * the same amount of time, so longer strings animate proportionally longer
 * (constant per-character speed rather than a fixed total).
 */
export const MS_PER_CHAR = 25;
const MIN_DUR = 400;
// cap the total reveal so long strings (e.g. FAQ answers) don't drag on
const MAX_DUR = 1000;

/** Blur applied to encrypted / mid-decrypt text — the "out of focus" look.
 * Keep in sync with `.decrypt-pending` in globals.css (the pre-hydration
 * resting state), so handing off from CSS to the JS effect is seamless. */
export const REVEAL_BLUR = 5;

/**
 * Put `el` into the encrypted resting state shown before a reveal: scrambled
 * cipher text, blurred. Decrypting (or cancelling) the element clears both.
 */
export function encrypt(el: HTMLElement | null, text: string): void {
  if (!el) return;
  if (fxOff("decrypt")) {
    el.textContent = text;
    return;
  }
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
  if (prefersReducedMotion() || fxOff("decrypt")) {
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

/* ---- fixed-cell reveal: each glyph holds a fixed-width slot ---- */

type Cell = { span: HTMLElement | null; ch: string };

/**
 * Rebuild `el`'s text as one fixed-width slot per character: every non-space
 * glyph becomes an `inline-block` pinned to that character's final rendered
 * width, with its (scrambling) glyph centered inside. Because each slot's width
 * never changes, the text occupies its exact final footprint at every frame —
 * so a centered or wrapping headline can't breathe sideways or re-flow to a
 * different line mid-decrypt (the failure modes `lockLineWidth` can't fix for
 * multi-line text). Spaces stay as real whitespace so wrapping still happens at
 * the same points. Widths are measured in one batch before any is pinned, so we
 * don't force a reflow per character. Returns the ordered cells (span `null`
 * for whitespace) for the animator to drive; flatten back with
 * `el.textContent = text` when done so the text reflows normally again.
 */
function buildCells(el: HTMLElement, text: string): Cell[] {
  el.style.whiteSpace = "";
  el.style.width = "";
  el.style.marginInline = "";
  el.style.textAlign = "";
  el.textContent = "";
  // Group each run of non-space glyphs into a `nowrap` wrapper so the line can
  // only break between words (at real whitespace). Without this, every
  // fixed-width slot is its own break opportunity and long words split
  // mid-word during the effect, then snap back when the text re-flows.
  const cells: Cell[] = [];
  let word: HTMLElement | null = null;
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      word = null;
      el.appendChild(document.createTextNode(ch));
      cells.push({ span: null, ch });
      continue;
    }
    if (!word) {
      word = document.createElement("span");
      word.style.whiteSpace = "nowrap";
      el.appendChild(word);
    }
    const s = document.createElement("span");
    s.style.display = "inline-block";
    s.textContent = ch;
    word.appendChild(s);
    cells.push({ span: s, ch });
  }
  // measure every glyph first (one layout pass), then pin — reading a width
  // after each pin would thrash layout character by character
  const widths = cells.map((c) =>
    c.span ? c.span.getBoundingClientRect().width : 0,
  );
  cells.forEach((c, i) => {
    if (c.span) {
      c.span.style.width = `${widths[i]}px`;
      c.span.style.textAlign = "center";
    }
  });
  return cells;
}

/**
 * Fixed-cell version of `encrypt`: the pre-reveal resting state for headings
 * that reveal via `decryptCells`, so they sit correctly wrapped (not breathing)
 * while scrambled and blurred below the fold.
 */
export function encryptCells(el: HTMLElement | null, text: string): void {
  if (!el || prefersReducedMotion() || fxOff("decrypt")) return;
  const cells = buildCells(el, text);
  for (const c of cells) if (c.span) c.span.textContent = randChar();
  el.style.filter = `blur(${REVEAL_BLUR}px)`;
}

/**
 * Fixed-cell counterpart to `decryptTo`: same left-to-right lock, tail
 * re-randomization and blur-into-focus, but each glyph animates inside a
 * fixed-width slot so the line never changes width. Use for centered and/or
 * multi-line headings. On completion the cells are flattened back to plain text
 * (so it reflows on resize) before `done` runs.
 */
export function decryptCells(
  el: HTMLElement | null,
  text: string,
  dur?: number,
  done?: () => void,
): void {
  if (!el) return;
  const node = el as DecryptEl;
  if (prefersReducedMotion() || fxOff("decrypt")) {
    node.textContent = text;
    done?.();
    return;
  }
  const cells = buildCells(node, text);
  const n = cells.length;
  const scr = cells.map((c) => (c.span ? randChar() : ""));
  // paint the fully-scrambled, blurred state synchronously so the real text
  // measured a moment ago never flashes before the first animation frame
  cells.forEach((c, i) => {
    if (c.span) c.span.textContent = scr[i];
  });
  node.style.filter = `blur(${REVEAL_BLUR}px)`;
  const duration = dur ?? Math.min(Math.max(MS_PER_CHAR * n, MIN_DUR), MAX_DUR);
  const t0 = performance.now();
  let last = 0;
  const token = (node._decryptToken = (node._decryptToken || 0) + 1);
  function frame(t: number) {
    if (node._decryptToken !== token) return;
    const p = Math.min(1, (t - t0) / duration);
    const lock = Math.floor(p * n);
    const b = REVEAL_BLUR * Math.max(0, 1 - p / 0.6);
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "";
    const reRand = t - last > 45;
    if (reRand) last = t;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      if (!c.span) continue;
      if (i < lock) {
        if (c.span.textContent !== c.ch) c.span.textContent = c.ch;
      } else if (reRand) {
        scr[i] = randChar();
        c.span.textContent = scr[i];
      }
    }
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      node.textContent = text;
      node.style.filter = "";
      done?.();
    }
  }
  requestAnimationFrame(frame);
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
  if (prefersReducedMotion() || fxOff("decrypt")) {
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
  // paint the fully-scrambled, blurred state synchronously so the real text
  // measured a moment ago never flashes before the first animation frame
  for (let si = 0; si < nodes.length; si++) {
    nodes[si].textContent = scrs[si].join("");
    nodes[si].style.filter = `blur(${REVEAL_BLUR}px)`;
  }
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
  if (prefersReducedMotion() || fxOff("decrypt")) return;
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
  // Same word-grouping as `buildCells`: keep each word's letters in a `nowrap`
  // wrapper so a letter that becomes a fixed-width slot on hover can't open a
  // mid-word break.
  let word: HTMLElement | null = null;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      word = null;
      el.appendChild(document.createTextNode(ch));
      return;
    }
    if (!word) {
      word = document.createElement("span");
      word.style.whiteSpace = "nowrap";
      el.appendChild(word);
    }
    const s = document.createElement("span");
    s.textContent = ch;
    const cbase = gradient ? gradAt(n <= 1 ? 0 : i / (n - 1)) : "";
    if (cbase) s.style.color = cbase;
    let busy = false;
    s.addEventListener("mouseenter", () => {
      if (busy) return;
      busy = true;
      // Freeze this glyph's slot to its real width for the flicker so the
      // wider/narrower cipher glyphs don't shove the rest of the line (and
      // re-center it) on every scramble frame. Released when the flicker
      // ends, so the resting line stays natural text and reflows on resize.
      s.style.width = `${s.getBoundingClientRect().width}px`;
      s.style.display = "inline-block";
      s.style.textAlign = "center";
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
          s.style.width = "";
          s.style.display = "";
          s.style.textAlign = "";
          busy = false;
        }
      }, 45);
    });
    word.appendChild(s);
  });
}
