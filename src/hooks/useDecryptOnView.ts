"use client";

import { useEffect, useRef } from "react";
import {
  cancelDecrypt,
  decryptTo,
  prefersReducedMotion,
  scramble,
} from "@/lib/decrypt";

/**
 * Scrambles an element's text while it's below the fold and decrypts it when
 * it scrolls into view. The element renders its real text on the server (for
 * SEO / no-JS) — the scramble only happens after hydration.
 */
export function useDecryptOnView<T extends HTMLElement>(
  text: string,
  { duration = 1200, threshold = 0.5 }: { duration?: number; threshold?: number } = {},
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let done = false;
    if (el.getBoundingClientRect().top > window.innerHeight) {
      el.textContent = scramble(text);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting && !done) {
            done = true;
            decryptTo(el, text, duration);
            io.unobserve(el);
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelDecrypt(el);
      el.textContent = text;
    };
  }, [text, duration, threshold]);

  return ref;
}
