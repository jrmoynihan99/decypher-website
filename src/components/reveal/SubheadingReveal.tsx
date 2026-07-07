"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { noop } from "@/lib/noop";
import { useRevealDelay } from "@/lib/transition-timing";
import { useSectionReveal } from "@/context/SectionRevealContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Masked slide-up for one-liners: eyebrows, mono readouts, footnote lines. */
type SubheadingRevealProps = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  immediate?: boolean;
};

export default function SubheadingReveal({
  children,
  delay = 0,
  className = "",
  immediate = false,
}: SubheadingRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px 0px -60px 0px", amount: 0.3 });
  const section = useSectionReveal();
  const totalDelay = delay + useRevealDelay();
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const shouldAnimate = immediate || (section ? section.triggered : isInView);

  return (
    <div ref={ref} style={{ overflow: "hidden" }} className={className}>
      <motion.div
        initial={{ y: "100%" }}
        animate={shouldAnimate ? { y: 0 } : { y: "100%" }}
        onUpdate={noop}
        transition={{ duration: 1.2, ease: [0.08, 0.82, 0.17, 1] as [number, number, number, number], delay: totalDelay }}
        style={{ willChange: "transform" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
