"use client";

import { motion } from "framer-motion";
import { useRevealDelay } from "@/lib/transition-timing";
import { useSectionReveal } from "@/context/SectionRevealContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

/** Fade + rise-in for a block of content (buttons, cards, panels). */
type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  immediate?: boolean;
  /** Portion of the element that must be visible to self-trigger — lower it
   * for tall blocks so they don't wait for 30% of their height. */
  amount?: number;
};

export default function Reveal({
  children,
  delay = 0,
  className = "",
  immediate = false,
  amount = 0.3,
}: RevealProps) {
  const ease = [0.08, 0.82, 0.17, 1] as [number, number, number, number];
  const totalDelay = delay + useRevealDelay();
  const section = useSectionReveal();
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const animationProps = immediate || (section && section.triggered)
    ? {
        initial: { opacity: 0, y: 32 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 1.2, ease, delay: totalDelay },
      }
    : section
      ? {
          initial: { opacity: 0, y: 32 },
          animate: { opacity: 0, y: 32 },
          transition: { duration: 1.2, ease, delay: totalDelay },
        }
      : {
          initial: { opacity: 0, y: 32 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "0px 0px -60px 0px", amount },
          transition: { duration: 1.2, ease, delay: totalDelay },
        };

  return (
    <motion.div
      {...animationProps}
      onUpdate={noop}
      style={{ willChange: "transform, opacity" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
