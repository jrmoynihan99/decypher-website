"use client";

import { motion } from "framer-motion";
import { useRevealDelay } from "@/lib/transition-timing";
import { useSectionReveal } from "@/context/SectionRevealContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

/** Fade + settle-down (1.05 → 1) for framed media: images, video, viewports. */
type ScaleRevealProps = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  immediate?: boolean;
};

export default function ScaleReveal({ children, delay = 0, className = "", immediate = false }: ScaleRevealProps) {
  const ease = [0.08, 0.82, 0.17, 1] as [number, number, number, number];
  const totalDelay = delay + useRevealDelay();
  const section = useSectionReveal();
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const animationProps = immediate || (section && section.triggered)
    ? {
        initial: { opacity: 0, scale: 1.05 },
        animate: { opacity: 1, scale: 1.0 },
        transition: { duration: 1.5, ease, delay: totalDelay },
      }
    : section
      ? {
          initial: { opacity: 0, scale: 1.05 },
          animate: { opacity: 0, scale: 1.05 },
          transition: { duration: 1.5, ease, delay: totalDelay },
        }
      : {
          initial: { opacity: 0, scale: 1.05 },
          whileInView: { opacity: 1, scale: 1.0 },
          viewport: { once: true, margin: "0px 0px -60px 0px", amount: 0.3 },
          transition: { duration: 1.5, ease, delay: totalDelay },
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
