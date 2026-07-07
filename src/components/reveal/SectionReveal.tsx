"use client";

import { useRef } from "react";
import { useInView, type UseInViewOptions } from "framer-motion";
import { SectionRevealContext } from "@/context/SectionRevealContext";

/**
 * Choreography wrapper: watches the viewport once and broadcasts the trigger
 * to every reveal inside, so a section's eyebrow / copy / buttons fire as one
 * staggered sequence (via their `delay` props) instead of independently.
 */
type SectionRevealProps = {
  children: React.ReactNode;
  amount?: number;
  margin?: UseInViewOptions["margin"];
  className?: string;
  enabled?: boolean;
};

export default function SectionReveal({
  children,
  amount = 0.15,
  margin = "0px",
  className,
  enabled = true,
}: SectionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount, margin });

  if (!enabled) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  return (
    <SectionRevealContext.Provider value={{ triggered: isInView }}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </SectionRevealContext.Provider>
  );
}
