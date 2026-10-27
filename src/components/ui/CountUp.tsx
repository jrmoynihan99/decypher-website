"use client";

import { useEffect, useRef, useState } from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { prefersReducedMotion } from "@/lib/decrypt";

/**
 * The count-up every figure on the site rolls in with: NumberFlow's digit
 * roll, from zero, once. This is the recap page's reveal (it used to live in
 * RecapView), lifted out so the home page's proof section, the stat cards and
 * the portal all roll the same way.
 *
 * Two triggers. By default the figure waits until it scrolls into view, then
 * rolls after a short beat; `delay` holds it back further, for figures that
 * land one after another. Pass `start` to drive it yourself instead — a panel
 * that becomes current, a card that's just been revealed — and it rolls the
 * moment `start` turns true, with the same beat.
 *
 * Reduced motion: still waits for the trigger, but lands without the beat
 * (NumberFlow skips the roll itself when the OS asks).
 *
 * NB: NumberFlow renders its digits in Shadow DOM, so a `background-clip:
 * text` gradient can't reach them. Colour these with a solid `color`, which
 * inherits across the boundary — never with `text-grad`.
 */
const MONEY: Format = { style: "currency", currency: "USD", maximumFractionDigits: 0 };
const INT: Format = { maximumFractionDigits: 0 };

export default function CountUp({
  value,
  delay = 0,
  start,
  format = "money",
  prefix,
  suffix,
  className,
}: {
  value: number;
  /** Extra ms before the roll, on top of the 250ms beat. */
  delay?: number;
  /** When given, the trigger: rolls once this turns true. Otherwise rolls on scroll into view. */
  start?: boolean;
  /** "money" ($1,234), "int" (1,234), or NumberFlow's own format options. */
  format?: "money" | "int" | Format;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const driven = start !== undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wait = prefersReducedMotion() ? 0 : 250 + delay;
    let timer = 0;
    if (driven) {
      if (start) timer = window.setTimeout(() => setShown(value), wait);
      return () => clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        timer = window.setTimeout(() => setShown(value), wait);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [value, delay, start, driven]);

  const preset = format === "money" || format === "int";
  const fmt = format === "money" ? MONEY : format === "int" ? INT : format;
  const v = isFinite(shown) ? (preset ? Math.round(shown) : shown) : 0;
  return (
    <span ref={ref} className={className}>
      <NumberFlow value={v} locales="en-US" format={fmt} prefix={prefix} suffix={suffix} />
    </span>
  );
}
