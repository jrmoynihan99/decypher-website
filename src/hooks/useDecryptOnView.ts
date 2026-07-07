"use client";

import { useEffect, useRef } from "react";
import {
  armHover,
  cancelDecrypt,
  decryptCells,
  encryptCells,
  prefersReducedMotion,
} from "@/lib/decrypt";

/**
 * Scrambles an element's text while it's below the fold and decrypts it when
 * it scrolls into view. The element renders its real text on the server (for
 * SEO / no-JS) — the scramble only happens after hydration.
 */
export function useDecryptOnView<T extends HTMLElement>(
  text: string,
  { duration, threshold = 0.5 }: { duration?: number; threshold?: number } = {},
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let done = false;
    if (el.getBoundingClientRect().top > window.innerHeight) {
      encryptCells(el, text);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting && !done) {
            done = true;
            decryptCells(el, text, duration, () => armHover(el));
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
