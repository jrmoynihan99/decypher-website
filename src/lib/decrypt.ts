/**
 * "Decrypt" text effects shared across the site: text starts as scrambled
 * cipher characters and resolves left-to-right into the real copy.
 */
export const CIPHER_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ0123456789#$%&@+=/<>";

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
 * Animate `el`'s textContent from scrambled noise to `target`. Characters
 * lock in left-to-right over `dur` ms while the unrevealed tail re-randomizes
 * every ~90ms. A token guards against overlapping runs on the same element.
 */
export function decryptTo(
  el: HTMLElement | null,
  target: string,
  dur: number,
  done?: () => void,
): void {
  if (!el) return;
  const node = el as DecryptEl;
  if (prefersReducedMotion()) {
    node.textContent = target;
    done?.();
    return;
  }
  const n = target.length;
  const scr = Array.from(target, (c) => (/\s/.test(c) ? c : randChar()));
  const t0 = performance.now();
  let last = 0;
  const token = (node._decryptToken = (node._decryptToken || 0) + 1);
  function frame(t: number) {
    if (node._decryptToken !== token) return;
    const p = Math.min(1, (t - t0) / dur);
    const lock = Math.floor(p * n);
    if (t - last > 90) {
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
}
