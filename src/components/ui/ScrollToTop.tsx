"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

/**
 * Floating back-to-top button, bottom-right, fading in once the visitor is a
 * viewport down the page. Same iOS 26 rules as the navbar: inset off the
 * edges, and display:none once the hide fade finishes — a fixed element left
 * in the DOM (even at opacity 0) makes Safari paint its bottom bar solid.
 * Near-solid night instead of backdrop-blur: it sits on an always-animating
 * canvas, and blur over a live canvas re-filters every frame on phones.
 */
export default function ScrollToTop() {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.button
      type="button"
      aria-label="Scroll back to top"
      onClick={() =>
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
      }
      initial={false}
      animate={{
        opacity: shown ? 1 : 0,
        y: shown ? 0 : 14,
        display: "flex",
        transitionEnd: { display: shown ? "flex" : "none" },
      }}
      transition={{
        duration: reduced ? 0 : 0.35,
        ease: [0.08, 0.82, 0.17, 1] as [number, number, number, number],
      }}
      onUpdate={noop}
      className="fixed bottom-4 right-4 z-[80] hidden h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-edge-bright bg-night/85 text-mist shadow-[0_10px_30px_rgba(0,0,0,.45)] transition-colors hover:border-magenta hover:text-magenta md:bottom-6 md:right-6"
    >
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" />
      </svg>
    </motion.button>
  );
}
